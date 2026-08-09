import { registerClient } from "../../src/oauth/clients";
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

/** RFC 7591 Dynamic Client Registration — Claude.ai uses this. */
export async function POST(req: Request) {
  try {
    const rl = await oauthRateLimiter.check(`register:${clientIpFromRequest(req)}`);
    if (!rl.allowed) {
      return Response.json(
        { error: "rate_limit_exceeded", error_description: "Too many registration requests" },
        {
          status: 429,
          headers: {
            ...CORS,
            "Retry-After": String(Math.max(1, Math.ceil(rl.retryAfterMs / 1000))),
          },
        }
      );
    }

    if (!process.env.OAUTH_JWT_SECRET || process.env.OAUTH_JWT_SECRET.length < 16) {
      return Response.json(
        {
          error: "server_error",
          error_description: "OAUTH_JWT_SECRET is not configured on the server",
        },
        { status: 500, headers: CORS }
      );
    }

    const body = (await req.json()) as {
      redirect_uris?: string[];
      client_name?: string;
      token_endpoint_auth_method?: string;
      grant_types?: string[];
      response_types?: string[];
      scope?: string;
    };

    if (!body.redirect_uris?.length) {
      return Response.json(
        { error: "invalid_client_metadata", error_description: "redirect_uris required" },
        { status: 400, headers: CORS }
      );
    }

    let reg;
    try {
      reg = registerClient({
        redirect_uris: body.redirect_uris,
        client_name: body.client_name ?? "Claude",
        token_endpoint_auth_method: body.token_endpoint_auth_method ?? "none",
      });
    } catch (regErr) {
      const msg = regErr instanceof Error ? regErr.message : String(regErr);
      if (msg.includes("redirect_uri")) {
        return Response.json(
          { error: "invalid_redirect_uri", error_description: msg },
          { status: 400, headers: CORS }
        );
      }
      throw regErr;
    }

    return Response.json(
      {
        client_id: reg.client_id,
        client_id_issued_at: reg.client_id_issued_at,
        client_secret_expires_at: 0,
        redirect_uris: reg.redirect_uris,
        grant_types: body.grant_types ?? ["authorization_code", "refresh_token"],
        response_types: body.response_types ?? ["code"],
        token_endpoint_auth_method: body.token_endpoint_auth_method ?? "none",
        client_name: body.client_name ?? "Claude",
        scope: body.scope ?? "mcp offline_access",
      },
      { status: 201, headers: { "Content-Type": "application/json", ...CORS } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "server_error", error_description: message },
      { status: 500, headers: CORS }
    );
  }
}
