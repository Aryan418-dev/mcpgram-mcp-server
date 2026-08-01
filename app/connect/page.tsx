import { Suspense } from "react";
import { ConnectClient } from "./ConnectClient";
import { PROVIDERS, providerConfigured } from "../../src/connectors/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function ConnectPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const publicUrl = (process.env.MCP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const appRedirectUrl =
    process.env.MCPGRAM_APP_URL?.replace(/\/$/, "") ||
    process.env.MCPGRAM_BASE_URL?.replace(/\/$/, "") ||
    "https://mcpgram.vercel.app";

  const rawErr = searchParams?.error;
  const initialError = Array.isArray(rawErr) ? rawErr[0] : rawErr ?? null;

  const providers = Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    logoUrl: p.logoUrl,
    configured: providerConfigured(p),
  }));

  return (
    <Suspense
      fallback={
        <p style={{ padding: 24, fontFamily: "system-ui", color: "#BDBDBD", background: "#000" }}>
          Loading…
        </p>
      }
    >
      <ConnectClient
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnon}
        publicUrl={publicUrl || "https://mcpgram-mcp-server.vercel.app"}
        appRedirectUrl={appRedirectUrl}
        providers={providers}
        initialError={initialError}
      />
    </Suspense>
  );
}
