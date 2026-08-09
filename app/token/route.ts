import { loadClient } from "../../src/oauth/clients";
import {
  consumeAuthCode,
  issueAccessToken,
  issueRefreshToken,
  verifyPkceChallenge,
  verifyRefreshToken,
  rotateRefreshToken,
} from "../../src/oauth/tokens";
import { oauthRateLimiter, clientIpFromRequest } from "../../src/middleware/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function parseBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await req.json()) as Record<string, string>;
    return j;
  }
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function oauthError(error: string, description: string, status = 400) {
  return Response.json(
    { error, error_description: description },
    { status, headers: CORS }
  );
}

export async function POST(req: Request) {
  try {
    const rl = await oauthRateLimiter.check(`token:${clientIpFromRequest(req)}`);
    if (!rl.allowed) {
      return Response.json(
        { error: "rate_limit_exceeded", error_description: "Too many token requests" },
        {
          status: 429,
          headers: {
            ...CORS,
            "Retry-After": String(Math.max(1, Math.ceil(rl.retryAfterMs / 1000))),
          },
        }
      );
    }

    const body = await parseBody(req);
    const grant = body.grant_type;

    if (grant === "authorization_code") {
      const code = body.code;
      const redirect_uri = body.redirect_uri;
      const client_id = body.client_id;
      const code_verifier = body.code_verifier;

      if (!code || !redirect_uri || !client_id || !code_verifier) {
        return oauthError("invalid_request", "code, redirect_uri, client_id, code_verifier required");
      }

      const client = loadClient(client_id);
      if (!client) return oauthError("invalid_client", "Unknown client_id", 401);

      const rec = await consumeAuthCode(code);
      if (!rec) return oauthError("invalid_grant", "Invalid or expired code");
      if (rec.client_id !== client_id) return oauthError("invalid_grant", "client_id mismatch");
      if (rec.redirect_uri !== redirect_uri) {
        return oauthError("invalid_grant", "redirect_uri mismatch");
      }
      if (!verifyPkceChallenge(code_verifier, rec.code_challenge, rec.code_challenge_method)) {
        return oauthError("invalid_grant", "PKCE verification failed");
      }

      const access = issueAccessToken({
        sub: rec.user_id,
        client_id,
        workspace_id: rec.workspace_id,
        api_key: rec.api_key,
        workspaces: rec.workspaces,
        scope: rec.scope,
      });
      const refresh_token = issueRefreshToken({
        sub: rec.user_id,
        client_id,
        workspace_id: rec.workspace_id,
        api_key: rec.api_key,
        workspaces: rec.workspaces,
        scope: rec.scope,
      });

      return Response.json(
        {
          ...access,
          refresh_token,
          scope: rec.scope,
        },
        { headers: CORS }
      );
    }

    if (grant === "refresh_token") {
      const refresh = body.refresh_token;
      if (!refresh) return oauthError("invalid_request", "refresh_token required");
      const claims = await verifyRefreshToken(refresh);
      if (!claims) return oauthError("invalid_grant", "Invalid refresh_token");

      // Rotate: invalidate previous refresh jti, keep family id
      await rotateRefreshToken(claims);

      const access = issueAccessToken({
        sub: claims.sub,
        client_id: claims.client_id,
        workspace_id: claims.workspace_id,
        api_key: claims.api_key,
        workspaces: claims.workspaces,
        scope: claims.scope,
      });
      const refresh_token = issueRefreshToken({
        sub: claims.sub,
        client_id: claims.client_id,
        workspace_id: claims.workspace_id,
        api_key: claims.api_key,
        workspaces: claims.workspaces,
        scope: claims.scope,
        fid: claims.fid,
      });

      return Response.json({ ...access, refresh_token, scope: claims.scope }, { headers: CORS });
    }

    return oauthError("unsupported_grant_type", "Only authorization_code and refresh_token");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return oauthError("server_error", message, 500);
  }
}
