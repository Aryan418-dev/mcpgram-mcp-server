import { createClient } from "@supabase/supabase-js";
import { loadClient, clientAllowsRedirect } from "../../../../src/oauth/clients";
import { issueAuthCode } from "../../../../src/oauth/tokens";
import { issueWorkspaceApiKey } from "../../../../src/oauth/supabase";
import { publicBaseUrl } from "../../../../src/oauth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const userJwt = m[1];

    const body = (await req.json()) as {
      client_id: string;
      redirect_uri: string;
      state?: string;
      code_challenge: string;
      code_challenge_method?: string;
      scope?: string;
      workspace_id: string;
      resource?: string;
    };

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: userData, error } = await sb.auth.getUser(userJwt);
    if (error || !userData.user) {
      return Response.json({ error: "Invalid session" }, { status: 401 });
    }

    const client = loadClient(body.client_id);
    if (!client) return Response.json({ error: "Unknown client_id" }, { status: 400 });
    if (!clientAllowsRedirect(client, body.redirect_uri)) {
      return Response.json({ error: "redirect_uri not registered for this client" }, { status: 400 });
    }
    if (!body.code_challenge) {
      return Response.json({ error: "code_challenge required (PKCE)" }, { status: 400 });
    }
    if (!body.workspace_id) {
      return Response.json({ error: "workspace_id required" }, { status: 400 });
    }

    const apiKey = await issueWorkspaceApiKey(
      body.workspace_id,
      `Claude OAuth (${userData.user.email ?? userData.user.id.slice(0, 8)})`
    );

    const code = issueAuthCode({
      client_id: body.client_id,
      redirect_uri: body.redirect_uri,
      code_challenge: body.code_challenge,
      code_challenge_method: body.code_challenge_method ?? "S256",
      user_id: userData.user.id,
      workspace_id: body.workspace_id,
      api_key: apiKey,
      scope: body.scope ?? "mcp",
    });

    const redirect = new URL(body.redirect_uri);
    redirect.searchParams.set("code", code);
    if (body.state) redirect.searchParams.set("state", body.state);
    // RFC 9207 iss parameter helps clients validate the AS
    redirect.searchParams.set("iss", publicBaseUrl(req));

    return Response.json({ redirect: redirect.toString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
