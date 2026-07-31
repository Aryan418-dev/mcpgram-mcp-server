import { Suspense } from "react";
import { AuthorizeClient } from "./AuthorizeClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server wrapper so Supabase public URL/key come from runtime env
 * (NEXT_PUBLIC_* must not rely solely on build-time inlining).
 */
export default function AuthorizePage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return (
    <Suspense fallback={<p style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</p>}>
      <AuthorizeClient supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnon} />
    </Suspense>
  );
}
