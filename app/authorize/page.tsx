import { Suspense } from "react";
import { AuthorizeClient } from "./AuthorizeClient";
import { loadClient } from "../../src/oauth/clients";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resolve a display logo for the OAuth client (web agents, CLI agents, IDEs).
 * Uses the same premium marks as install guides (LobeHub / Devicon / favicons).
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

  const LOBE = "https://unpkg.com/@lobehub/icons-static-svg@1.94.0/icons";

  const rules: { test: () => boolean; logo: string }[] = [
    {
      test: () =>
        name.includes("claude") ||
        hosts.some((h) => h === "claude.ai" || h.endsWith(".claude.ai")),
      logo: `${LOBE}/claude-color.svg`,
    },
    {
      test: () => name.includes("cursor") || hosts.some((h) => h.includes("cursor")),
      logo: `${LOBE}/cursor.svg`,
    },
    {
      test: () =>
        name.includes("chatgpt") ||
        name.includes("openai") ||
        hosts.some((h) => h.includes("openai") || h.includes("chatgpt")),
      logo: `${LOBE}/openai.svg`,
    },
    {
      test: () => name.includes("codex"),
      logo: `${LOBE}/codex-color.svg`,
    },
    {
      test: () =>
        name.includes("gemini") || hosts.some((h) => h.includes("gemini") || h.includes("google")),
      logo: `${LOBE}/gemini-color.svg`,
    },
    {
      test: () =>
        name.includes("grok") ||
        name.includes("xai") ||
        hosts.some((h) => h.includes("x.ai") || h.includes("grok")),
      logo: `${LOBE}/grok.svg`,
    },
    {
      test: () => name.includes("windsurf") || name.includes("cascade") || name.includes("codeium"),
      logo: `${LOBE}/windsurf-color.svg`,
    },
    {
      test: () =>
        name.includes("vscode") ||
        name.includes("vs code") ||
        name.includes("visual studio"),
      logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/vscode/vscode-original.svg",
    },
    {
      test: () => name.includes("copilot") || name.includes("github"),
      logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/github/github-original.svg",
    },
    {
      test: () => name.includes("manus") || hosts.some((h) => h.includes("manus")),
      logo: "https://www.google.com/s2/favicons?domain=manus.im&sz=128",
    },
    {
      test: () => name.includes("cline"),
      logo: "https://avatars.githubusercontent.com/u/184127137?s=128&v=4",
    },
    {
      test: () => name.includes("continue"),
      logo: "https://avatars.githubusercontent.com/u/105342031?s=128&v=4",
    },
    {
      test: () => name.includes("zed"),
      logo: "https://avatars.githubusercontent.com/u/79386116?s=128&v=4",
    },
    {
      test: () => name.includes("jetbrains") || name.includes("junie"),
      logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/jetbrains/jetbrains-original.svg",
    },
  ];

  for (const r of rules) {
    if (r.test()) return r.logo;
  }

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
        <p
          style={{
            padding: 24,
            fontFamily: "system-ui",
            color: "#BDBDBD",
            background: "#050507",
            minHeight: "100vh",
            margin: 0,
          }}
        >
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
