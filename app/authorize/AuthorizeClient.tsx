"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Props = { supabaseUrl: string; supabaseAnonKey: string };
type Workspace = { id: string; name: string };

export function AuthorizeClient({ supabaseUrl, supabaseAnonKey }: Props) {
  const sp = useSearchParams();
  const params = useMemo(
    () => ({
      response_type: sp.get("response_type") ?? "",
      client_id: sp.get("client_id") ?? "",
      redirect_uri: sp.get("redirect_uri") ?? "",
      state: sp.get("state") ?? "",
      code_challenge: sp.get("code_challenge") ?? "",
      code_challenge_method: sp.get("code_challenge_method") ?? "S256",
      scope: sp.get("scope") ?? "mcp",
      resource: sp.get("resource") ?? "",
    }),
    [sp]
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [success, setSuccess] = useState(false);

  function sb(): SupabaseClient {
    return createClient(supabaseUrl, supabaseAnonKey);
  }

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setError("Server misconfiguration: Supabase env vars missing");
      setSessionReady(true);
      return;
    }
    const client = sb();
    client.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u) setUser({ id: u.id, email: u.email });
      setSessionReady(true);
    });
    const { data: sub } = client.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabaseUrl, supabaseAnonKey]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const session = (await sb().auth.getSession()).data.session;
      if (!session) return;
      const res = await fetch("/api/oauth/workspaces", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError("Could not load workspaces");
        return;
      }
      const json = (await res.json()) as { workspaces: Workspace[] };
      const list = json.workspaces ?? [];
      setWorkspaces(list);
      setSelectedIds(new Set(list.map((w) => w.id)));
    })();
  }, [user]);

  const allSelected = workspaces.length > 0 && selectedIds.size === workspaces.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(workspaces.map((w) => w.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await sb().auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setBusy(false);
  }

  async function signInProvider(provider: "google" | "github") {
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      window.location.pathname + window.location.search
    )}`;
    const { error: err } = await sb().auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function approve() {
    if (selectedIds.size === 0) {
      setError("Select at least one workspace");
      return;
    }
    setBusy(true);
    setError(null);
    const session = (await sb().auth.getSession()).data.session;
    if (!session) {
      setError("Not signed in");
      setBusy(false);
      return;
    }
    const workspace_ids = workspaces.filter((w) => selectedIds.has(w.id)).map((w) => w.id);
    const res = await fetch("/api/oauth/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ...params, workspace_ids, workspace_id: workspace_ids[0] }),
    });
    const json = (await res.json()) as { redirect?: string; error?: string };
    if (!res.ok || !json.redirect) {
      setError(json.error ?? "Approval failed");
      setBusy(false);
      return;
    }
    setSuccess(true);
    setBusy(false);
    window.setTimeout(() => {
      window.location.href = json.redirect!;
    }, 1400);
  }

  if (!sessionReady) {
    return (
      <main style={styles.page}>
        <p style={{ color: "#BDBDBD", textAlign: "center" }}>Loading…</p>
      </main>
    );
  }

  if (params.response_type !== "code" || !params.client_id || !params.redirect_uri || !params.code_challenge) {
    return (
      <main style={styles.page}>
        <h1 style={styles.title}>Invalid authorization request</h1>
        <p style={styles.mute}>Missing required OAuth parameters.</p>
      </main>
    );
  }

  if (success) {
    return (
      <main style={styles.page}>
        <HeaderBar animate={false} success />
        <h1 style={styles.title}>Successfully Connected</h1>
        <p style={styles.subtitle}>Your application can now securely access your MCPGRAM workspace.</p>
        <button type="button" style={styles.btnPrimary} disabled>
          Continue
        </button>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <style>{`
        @keyframes tileFlow {
          0% { opacity: 0.15; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
          100% { opacity: 0.15; transform: scale(0.85); }
        }
        .mcp-tile { animation: tileFlow 2.4s ease-in-out infinite; }
        .mcp-tile:nth-child(1) { animation-delay: 0s; }
        .mcp-tile:nth-child(2) { animation-delay: 0.15s; }
        .mcp-tile:nth-child(3) { animation-delay: 0.3s; }
        .mcp-tile:nth-child(4) { animation-delay: 0.45s; }
        .mcp-tile:nth-child(5) { animation-delay: 0.6s; }
        .mcp-tile:nth-child(6) { animation-delay: 0.75s; }
        .mcp-tile:nth-child(7) { animation-delay: 0.9s; }
        .mcp-tile:nth-child(8) { animation-delay: 1.05s; }
        input[type="checkbox"] {
          appearance: none;
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border: 1.5px solid #2A2A2A;
          border-radius: 5px;
          background: #000;
          cursor: pointer;
          flex-shrink: 0;
          margin-top: 1px;
          position: relative;
        }
        input[type="checkbox"]:checked {
          background: #fff;
          border-color: #fff;
        }
        input[type="checkbox"]:checked::after {
          content: "";
          position: absolute;
          left: 5px;
          top: 1px;
          width: 5px;
          height: 10px;
          border: solid #000;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        input[type="checkbox"]:indeterminate {
          background: #fff;
          border-color: #fff;
        }
        input[type="checkbox"]:indeterminate::after {
          content: "";
          position: absolute;
          left: 3px;
          top: 7px;
          width: 10px;
          height: 2px;
          background: #000;
        }
      `}</style>

      <HeaderBar animate={!busy} success={false} />

      <h1 style={styles.title}>Connect to MCPGRAM</h1>
      <p style={styles.subtitle}>Choose which workspaces this application can access.</p>

      {!user ? (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Sign in</h2>
          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            <button type="button" style={styles.btnSecondary} disabled={busy} onClick={() => signInProvider("google")}>
              Google
            </button>
            <button type="button" style={styles.btnSecondary} disabled={busy} onClick={() => signInProvider("github")}>
              GitHub
            </button>
          </div>
          <form onSubmit={signInEmail}>
            <label style={styles.label}>
              Email
              <input
                style={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label style={styles.label}>
              Password
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <button type="submit" style={styles.btnPrimary} disabled={busy}>
              {busy ? "Signing in…" : "Sign in with email"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <p style={{ ...styles.mute, marginBottom: 16, fontSize: 13 }}>
            Signed in as <span style={{ color: "#FFFFFF" }}>{user.email ?? user.id}</span>
          </p>

          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={styles.cardTitle}>Choose Workspace</span>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#BDBDBD" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                />
                Select All
              </label>
            </div>

            {workspaces.length === 0 ? (
              <p style={styles.mute}>No workspaces found.</p>
            ) : (
              <div style={styles.checkboxList}>
                {workspaces.map((w) => (
                  <label key={w.id} style={styles.checkboxRow}>
                    <input type="checkbox" checked={selectedIds.has(w.id)} onChange={() => toggleOne(w.id)} />
                    <span>
                      <span style={{ color: "#FFFFFF", fontWeight: 500 }}>{w.name}</span>
                      <span style={{ display: "block", fontSize: 11, color: "#6b6b6b", marginTop: 2 }}>{w.id}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ ...styles.card, marginTop: 12 }}>
            <div style={{ ...styles.cardTitle, marginBottom: 12 }}>Permissions</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {PERMISSIONS.map((p) => (
                <li key={p} style={styles.permRow}>
                  <span style={styles.checkIcon} aria-hidden>
                    ✓
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              style={styles.btnPrimary}
              disabled={busy || selectedIds.size === 0}
              onClick={approve}
            >
              {busy
                ? "Authorizing…"
                : selectedIds.size <= 1
                  ? "Authorize"
                  : `Authorize ${selectedIds.size} workspaces`}
            </button>
            <button type="button" style={styles.btnSecondary} onClick={() => sb().auth.signOut()} disabled={busy}>
              Cancel
            </button>
          </div>
        </>
      )}

      {error && (
        <p style={styles.error} role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

const PERMISSIONS = [
  "Read connected tools",
  "Execute actions",
  "Access files you have approved",
  "Sync data securely",
];

function HeaderBar({ animate, success }: { animate: boolean; success: boolean }) {
  return (
    <div style={styles.header}>
      <div style={styles.logoBox} aria-label="Client">
        <ClientMark />
      </div>

      <div style={styles.connector}>
        {success ? (
          <div style={styles.successRing} aria-label="Connected">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="#22C55E"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : (
          <div style={styles.tileRow} aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className={animate ? "mcp-tile" : undefined}
                style={{
                  width: 6,
                  height: 6,
                  background: "#FFFFFF",
                  borderRadius: 1.5,
                  display: "inline-block",
                  opacity: animate ? undefined : 0.35,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div style={styles.logoBox} aria-label="MCPGRAM">
        <McpgramMark />
      </div>
    </div>
  );
}

function ClientMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect x="3" y="3" width="22" height="22" rx="6" stroke="#FFFFFF" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="5" stroke="#FFFFFF" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="1.5" fill="#FFFFFF" />
    </svg>
  );
}

function McpgramMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="#FFFFFF" />
      <rect x="16" y="4" width="8" height="8" rx="1.5" fill="#FFFFFF" opacity="0.85" />
      <rect x="4" y="16" width="8" height="8" rx="1.5" fill="#FFFFFF" opacity="0.85" />
      <rect x="16" y="16" width="8" height="8" rx="1.5" fill="#FFFFFF" opacity="0.55" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily:
      "Geist, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    maxWidth: 420,
    margin: "0 auto",
    padding: "48px 20px 40px",
    minHeight: "100vh",
    background: "#000000",
    color: "#FFFFFF",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 28,
  },
  logoBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: "#111111",
    border: "1px solid #2A2A2A",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  connector: {
    width: 88,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tileRow: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  successRing: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "2px solid #22C55E",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(34, 197, 94, 0.08)",
  },
  title: {
    margin: "0 0 8px",
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    textAlign: "center",
    color: "#FFFFFF",
  },
  subtitle: {
    margin: "0 0 28px",
    fontSize: 14,
    lineHeight: 1.5,
    color: "#BDBDBD",
    textAlign: "center",
  },
  mute: {
    color: "#BDBDBD",
    fontSize: 14,
    margin: 0,
  },
  card: {
    background: "#111111",
    border: "1px solid #2A2A2A",
    borderRadius: 22,
    padding: 18,
  },
  cardTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "#FFFFFF",
  },
  label: {
    display: "block",
    marginBottom: 14,
    fontSize: 13,
    color: "#BDBDBD",
  },
  input: {
    display: "block",
    width: "100%",
    marginTop: 6,
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid #2A2A2A",
    background: "#000000",
    color: "#FFFFFF",
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
  },
  checkboxList: {
    maxHeight: 240,
    overflowY: "auto",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 4px",
    fontSize: 14,
    cursor: "pointer",
    borderTop: "1px solid #1a1a1a",
  },
  permRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    fontSize: 13,
    color: "#BDBDBD",
  },
  checkIcon: {
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: 13,
    width: 16,
    textAlign: "center",
  },
  btnPrimary: {
    width: "100%",
    padding: "13px 16px",
    borderRadius: 14,
    border: "none",
    background: "#FFFFFF",
    color: "#000000",
    fontWeight: 600,
    fontSize: 15,
    cursor: "pointer",
  },
  btnSecondary: {
    flex: 1,
    width: "100%",
    padding: "12px 16px",
    borderRadius: 14,
    border: "1px solid #FFFFFF",
    background: "#000000",
    color: "#FFFFFF",
    fontWeight: 500,
    fontSize: 14,
    cursor: "pointer",
  },
  error: {
    color: "#f87171",
    marginTop: 16,
    fontSize: 13,
    textAlign: "center",
  },
};
