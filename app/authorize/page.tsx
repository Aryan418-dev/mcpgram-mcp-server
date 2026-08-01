import { Suspense } from "react";
import { AuthorizeClient } from "./AuthorizeClient";
import { loadClient } from "../../src/oauth/clients";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resolve a display logo for the OAuth client.
 * Claude does not currently send logo_uri in DCR, so we infer from name / redirect hosts.
 * Prefer public CDN icons that allow cross-origin embedding (no need to host logos yourself).
 */
function resolveClientLogo(opts: {
  clientName?: string;
  redirectUris?: string[];
}): string | null {
  const name = (opts.clientName ?? "").toLowerCase();
  const hosts = (opts.redirectUris ?? [])
    .map((u) => {
      try {
        return new URL(u).hostname.toLowerCase();
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  const isClaude =
    name.includes("claude") ||
    hosts.some((h) => h === "claude.ai" || h.endsWith(".claude.ai"));

  if (isClaude) {
    // Google favicon CDN — CORS/CORP friendly for <img>
    return "https://www.google.com/s2/favicons?domain=claude.ai&sz=128";
  }

  const isCursor =
    name.includes("cursor") || hosts.some((h) => h.includes("cursor"));
  if (isCursor) {
    return "https://www.google.com/s2/favicons?domain=cursor.com&sz=128";
  }

  // Generic fallback from first redirect host
  if (hosts[0]) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hosts[0])}&sz=128`;
  }
  return null;
}

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
  const clientLogoUrl = resolveClientLogo({
    clientName,
    redirectUris: client?.redirect_uris,
  });

  return (
    <Suspense
      fallback={
        <p style={{ padding: 24, fontFamily: "system-ui", color: "#BDBDBD", background: "#000" }}>
          Loading…
        </p>
      }
    >
      <AuthorizeClient
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnon}
        clientName={clientName}
        clientLogoUrl={clientLogoUrl}
      />
    </Suspense>
  );
}
