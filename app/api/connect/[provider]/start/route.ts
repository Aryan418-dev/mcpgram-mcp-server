import { createClient } from "@supabase/supabase-js";
import { signPayload } from "../../../../src/oauth/crypto";
import {
  PROVIDERS,
  isProviderId,
  providerConfigured,
} from "../../../../src/connectors/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connect/[provider]/start?workspace_id=...
 * Redirects browser to the provider's OAuth authorize URL.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> | { provider: string } }
) {
  const params = await Promise.resolve(ctx.params);
  const provider = params.provider?.toLowerCase() ?? "";
  if (!isProviderId(provider)) {
    return Response.json({ error: "Unknown provider" }, { status: 404 });
  }
  const cfg = PROVIDERS[provider];
  if (!providerConfigured(cfg)) {
    return Response.json(
      {
        error: "provider_not_configured",
        error_description: `${cfg.name} OAuth is not configured on this server. Set ${cfg.clientIdEnv} and ${cfg.clientSecretEnv}.`,
      },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id") ?? "";
  if (!workspaceId) {
    return Response.json({ error: "workspace_id required" }, { status: 400 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const tokenFromQuery = url.searchParams.get("access_token") ?? "";
  const token = m?.[1] || tokenFromQuery;
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  const { data: userData, error } = await sb.auth.getUser(token);
  if (error || !userData.user) {
    return Response.json({ error: "Invalid session" }, { status: 401 });
  }

  const publicUrl = (process.env.MCP_PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, "");
  const redirectUri = `${publicUrl}/api/connect/${provider}/callback`;
  const state = signPayload({
    typ: "connector_oauth",
    provider,
    workspace_id: workspaceId,
    user_id: userData.user.id,
    exp: Math.floor(Date.now() / 1000) + 600,
  });

  const clientId = process.env[cfg.clientIdEnv]!;
  const authUrl = new URL(cfg.authorizeUrl);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  if (cfg.scopes.length) {
    authUrl.searchParams.set("scope", cfg.scopes.join(" "));
  }
  if (provider === "notion") {
    authUrl.searchParams.set("owner", "user");
  }
  if (cfg.extraAuthParams) {
    for (const [k, v] of Object.entries(cfg.extraAuthParams)) {
      if (v) authUrl.searchParams.set(k, v);
    }
  }

  return Response.redirect(authUrl.toString(), 302);
}
