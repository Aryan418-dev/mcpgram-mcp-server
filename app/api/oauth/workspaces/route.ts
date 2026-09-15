import { listUserWorkspaces } from "../../../../src/oauth/supabase";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(\S+)/i);
  if (m?.[1]) return m[1].trim();
  // Some clients send only the raw JWT
  const raw = auth.trim();
  if (raw && !raw.includes(" ") && raw.length > 20) return raw;
  return null;
}

export async function GET(req: Request) {
  const token = extractBearer(req);
  if (!token) {
    return Response.json(
      { error: "Unauthorized", detail: "Missing Bearer access token" },
      { status: 401 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return Response.json(
      { error: "Server misconfiguration", detail: "Supabase env missing" },
      { status: 500 }
    );
  }

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error } = await sb.auth.getUser(token);
  if (error || !userData?.user) {
    return Response.json(
      {
        error: "Invalid session",
        detail: error?.message || "Token could not be verified",
      },
      { status: 401 }
    );
  }

  try {
    const workspaces = await listUserWorkspaces(userData.user.id);
    return Response.json({ workspaces });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface missing service role clearly so ops can fix env
    if (message.includes("Missing env") || message.includes("SERVICE_ROLE")) {
      return Response.json(
        { error: "Server misconfiguration", detail: message },
        { status: 500 }
      );
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
