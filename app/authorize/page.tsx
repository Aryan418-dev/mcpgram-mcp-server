import { Suspense } from "react";
import { AuthorizeClient } from "./AuthorizeClient";
import { loadClient } from "../../src/oauth/clients";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server wrapper so Supabase public URL/key come from runtime env
 * and OAuth client_name is resolved for the consent UI.
 */
export default function AuthorizePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const rawClientId = searchParams?.client_id;
  const clientId = Array.isArray(rawClientId) ? rawClientId[0] : rawClientId ?? "";
  const client = clientId ? loadClient(clientId) : null;
  const clientName = client?.client_name?.trim() || "Application";

  return (
    <Suspense fallback={<p style={{ padding: 24, fontFamily: "system-ui", color: "#BDBDBD", background: "#000" }}>Loading…</p>}>
      <AuthorizeClient
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnon}
        clientName={clientName}
      />
    </Suspense>
  );
}
