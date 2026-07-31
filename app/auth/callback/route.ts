import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supabase OAuth callback (Google/GitHub).
 * Exchanges ?code= for a session cookie, then redirects back to /authorize…
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/authorize";

  if (!code) {
    return NextResponse.redirect(new URL("/authorize?error=missing_code", url.origin));
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(
      new URL(`/authorize?error=${encodeURIComponent(error?.message ?? "auth_failed")}`, url.origin)
    );
  }

  // Browser will re-establish session via client; pass tokens in fragment is avoided.
  // Use cookies via setAll pattern is harder without @supabase/ssr — redirect with
  // session stored by client after detecting hash. For PKCE code flow from Supabase
  // hosted, exchangeCodeForSession works server-side; set cookies for client.
  const res = NextResponse.redirect(new URL(next, url.origin));
  const access = data.session.access_token;
  const refresh = data.session.refresh_token;
  // Lightweight cookie so /authorize client can bootstrap (supabase-js localStorage is primary on client)
  res.cookies.set("sb-access-token", access, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
  res.cookies.set("sb-refresh-token", refresh, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
