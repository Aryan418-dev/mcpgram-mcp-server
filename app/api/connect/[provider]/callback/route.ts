import { verifyPayload } from "../../../../src/oauth/crypto";
import {
  PROVIDERS,
  isProviderId,
  providerConfigured,
} from "../../../../src/connectors/providers";
import { upsertConnectorConnection } from "../../../../src/connectors/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StateClaims = {
  typ: string;
  provider: string;
  workspace_id: string;
  user_id: string;
  exp?: number;
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> | { provider: string } }
) {
  const params = await Promise.resolve(ctx.params);
  const provider = params.provider?.toLowerCase() ?? "";
  const publicUrl = (process.env.MCP_PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, "");
  const fail = (msg: string) =>
    Response.redirect(`${publicUrl}/connect?error=${encodeURIComponent(msg)}`, 302);

  if (!isProviderId(provider)) return fail("Unknown provider");
  const cfg = PROVIDERS[provider];
  if (!providerConfigured(cfg)) return fail(`${cfg.name} is not configured`);

  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) return fail(url.searchParams.get("error_description") || err);

  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  if (!code || !stateRaw) return fail("Missing code or state");

  const state = verifyPayload<StateClaims>(stateRaw);
  if (
    !state ||
    state.typ !== "connector_oauth" ||
    state.provider !== provider ||
    !state.workspace_id ||
    !state.user_id
  ) {
    return fail("Invalid or expired state");
  }

  const clientId = process.env[cfg.clientIdEnv]!;
  const clientSecret = process.env[cfg.clientSecretEnv]!;
  const redirectUri = `${publicUrl}/api/connect/${provider}/callback`;

  let accessToken = "";
  let refreshToken: string | null = null;
  let tokenType = "bearer";
  let scope: string | null = null;
  let externalAccountId: string | null = null;
  let externalAccountName: string | null = null;
  let rawMeta: Record<string, unknown> = {};

  try {
    if (provider === "github") {
      const res = await fetch(cfg.tokenUrl, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        token_type?: string;
        scope?: string;
        error?: string;
      };
      if (!res.ok || !json.access_token) return fail(json.error || "GitHub token exchange failed");
      accessToken = json.access_token;
      refreshToken = json.refresh_token ?? null;
      tokenType = json.token_type ?? "bearer";
      scope = json.scope ?? null;
      const me = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
      });
      if (me.ok) {
        const u = (await me.json()) as { id?: number; login?: string };
        externalAccountId = u.id != null ? String(u.id) : null;
        externalAccountName = u.login ?? null;
      }
    } else if (provider === "slack") {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      });
      const res = await fetch(cfg.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        access_token?: string;
        token_type?: string;
        scope?: string;
        team?: { id?: string; name?: string };
        authed_user?: { id?: string; access_token?: string };
      };
      if (!json.ok || !json.access_token) return fail(json.error || "Slack token exchange failed");
      accessToken = json.access_token;
      tokenType = json.token_type ?? "bearer";
      scope = json.scope ?? null;
      externalAccountId = json.team?.id ?? null;
      externalAccountName = json.team?.name ?? null;
      rawMeta = { team: json.team, authed_user: json.authed_user };
    } else if (provider === "notion") {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const res = await fetch(cfg.tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        token_type?: string;
        workspace_id?: string;
        workspace_name?: string;
        error?: string;
      };
      if (!res.ok || !json.access_token) return fail(json.error || "Notion token exchange failed");
      accessToken = json.access_token;
      refreshToken = json.refresh_token ?? null;
      tokenType = json.token_type ?? "bearer";
      externalAccountId = json.workspace_id ?? null;
      externalAccountName = json.workspace_name ?? null;
      rawMeta = json as unknown as Record<string, unknown>;
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }

  try {
    await upsertConnectorConnection({
      userId: state.user_id,
      workspaceId: state.workspace_id,
      provider,
      accessToken,
      refreshToken,
      tokenType,
      scope,
      externalAccountId,
      externalAccountName,
      rawMeta,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }

  const success = new URL(`${publicUrl}/connect/success`);
  success.searchParams.set("provider", provider);
  if (externalAccountName) success.searchParams.set("account", externalAccountName);
  return Response.redirect(success.toString(), 302);
}
