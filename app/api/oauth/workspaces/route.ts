import { listUserWorkspaces } from "../../../../src/oauth/supabase";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = m[1];

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

  try {
    const workspaces = await listUserWorkspaces(userData.user.id);
    return Response.json({ workspaces });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
