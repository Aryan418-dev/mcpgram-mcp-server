"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Props = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  clientName: string;
};

type Workspace = { id: string; name: string };

const MCPGRAM_LOGO = "/logo-on-dark.png";

export function AuthorizeClient({ supabaseUrl, supabaseAnonKey, clientName }: Props) {
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

  const appName = (clientName && clientName.trim()) || "Application";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (!success || !redirectUrl) return;
    const t = window.setTimeout(() => {
      window.location.href = redirectUrl;
    }, 1600);
    return () => window.clearTimeout(t);
  }, [success, redirectUrl]);

  const allSelected = workspaces.length > 0 && selectedIds.size === workspaces.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll() {
    if (success) return;
    setSelectedIds(allSelected ? new Set() : new Set(workspaces.map((w) => w.id)));
  }

  function toggleOne(id: string) {
    if (success) return;
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
    setRedirectUrl(json.redirect);
    setSuccess(true);
    setBusy(false);
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

  return (
    <main style={styles.page}>
      <style>{`
        @keyframes tileFlow {
          0% { opacity: 0.2; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
          100% { opacity: 0.2; transform: translateY(0); }
        }
        @keyframes successPop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes successGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.35); }
          50% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
        }
        .mcp-tile { animation: tileFlow 2.2s ease-in-out infinite; }
        .mcp-tile:nth-child(1) { animation-delay: 0s; }
        .mcp-tile:nth-child(2) { animation-delay: 0.12s; }
        .mcp-tile:nth-child(3) { animation-delay: 0.24s; }
        .mcp-tile:nth-child(4) { animation-delay: 0.36s; }
        .mcp-tile:nth-child(5) { animation-delay: 0.48s; }
        .mcp-tile:nth-child(6) { animation-delay: 0.6s; }
        .mcp-tile:nth-child(7) { animation-delay: 0.72s; }
        .mcp-tile:nth-child(8) { animation-delay: 0.84s; }
        .success-check {
          animation: successPop 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards,
                     successGlow 1.2s ease-out 0.2s 2;
        }
      `}</style>

      {/* Header: client app ↔ MCPGRAM */}
      <div style={styles.header}>
        <div style={styles.logoBox} title={appName}>
          <div style={styles.clientInitial}>{appName.slice(0, 1).toUpperCase()}</div>
        </div>

        <div style={styles.connector} aria-hidden>
          {success ? (
            <div className="success-check" style={styles.successRing}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
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
            <div style={styles.tileRow}>
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className={!busy ? "mcp-tile" : undefined}
                  style={{
                    width: 6,
                    height: 6,
                    background: "#FFFFFF",
                    borderRadius: 1.5,
                    display: "inline-block",
                    opacity: busy ? 0.35 : undefined,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div style={styles.logoBox} title="MCPGRAM">
          <img src={MCPGRAM_LOGO} alt="MCPGRAM" width={32} height={32} style={{ display: "block", objectFit: "contain" }} />
        </div>
      </div>

      <h1 style={styles.title}>
        {success ? "Successfully Connected" : `Connect ${appName} to MCPGRAM`}
      </h1>
      <p style={styles.subtitle}>
        {success
          ? `${appName} can now securely access your MCPGRAM workspace.`
          : `Choose which workspaces ${appName} can access.`}
      </p>

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
          <p style={{ ...styles.mute, marginBottom: 16, fontSize: 13, textAlign: "center" }}>
            Signed in as <span style={{ color: "#FFFFFF" }}>{user.email ?? user.id}</span>
          </p>

          <div style={{ ...styles.card, opacity: success ? 0.55 : 1, pointerEvents: success ? "none" : "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={styles.cardTitle}>Choose Workspace</span>
              <button
                type="button"
                onClick={toggleAll}
                style={styles.selectAllBtn}
                disabled={workspaces.length === 0 || success}
              >
                {allSelected ? "Deselect all" : "Select all"}
                {someSelected ? " ·" : ""}
              </button>
            </div>

            {workspaces.length === 0 ? (
              <p style={styles.mute}>No workspaces found.</p>
            ) : (
              <div style={styles.checkboxList} role="group" aria-label="Workspaces">
                {workspaces.map((w) => {
                  const checked = selectedIds.has(w.id);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => toggleOne(w.id)}
                      style={{
                        ...styles.wsRow,
                        borderColor: checked ? "#FFFFFF" : "#2A2A2A",
                        background: checked ? "#1a1a1a" : "transparent",
                      }}
                      aria-pressed={checked}
                    >
                      <span
                        style={{
                          ...styles.box,
                          background: checked ? "#FFFFFF" : "#000000",
                          borderColor: checked ? "#FFFFFF" : "#2A2A2A",
                        }}
                      >
                        {checked ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : null}
                      </span>
                      <span style={{ textAlign: "left" }}>
                        <span style={{ color: "#FFFFFF", fontWeight: 500, display: "block" }}>{w.name}</span>
                        <span style={{ display: "block", fontSize: 11, color: "#6b6b6b", marginTop: 2 }}>{w.id}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ ...styles.card, marginTop: 12, opacity: success ? 0.55 : 1 }}>
            <div style={{ ...styles.cardTitle, marginBottom: 12 }}>Permissions</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {PERMISSIONS.map((p) => (
                <li key={p} style={styles.permRow}>
                  <span style={styles.checkIcon} aria-hidden>✓</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {success ? (
              <button type="button" style={styles.btnPrimary} disabled>
                Connected
              </button>
            ) : (
              <>
                <button
                  type="button"
                  style={{
                    ...styles.btnPrimary,
                    opacity: busy || selectedIds.size === 0 ? 0.5 : 1,
                    cursor: busy || selectedIds.size === 0 ? "not-allowed" : "pointer",
                  }}
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
              </>
            )}
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: 'Geist, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    width: 56,
    height: 56,
    borderRadius: 16,
    background: "#111111",
    border: "1px solid #2A2A2A",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  clientInitial: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "#FFFFFF",
    color: "#000000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 18,
  },
  connector: {
    width: 96,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
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
    background: "rgba(34, 197, 94, 0.1)",
  },
  title: {
    margin: "0 0 8px",
    fontSize: 22,
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
  selectAllBtn: {
    background: "transparent",
    border: "none",
    color: "#BDBDBD",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
    fontFamily: "inherit",
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
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 8,
    maxHeight: 260,
    overflowY: "auto",
  },
  wsRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 12px",
    fontSize: 14,
    cursor: "pointer",
    borderRadius: 14,
    border: "1px solid #2A2A2A",
    width: "100%",
    fontFamily: "inherit",
    color: "inherit",
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    border: "1.5px solid #2A2A2A",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
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
    fontFamily: "inherit",
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
    fontFamily: "inherit",
  },
  error: {
    color: "#f87171",
    marginTop: 16,
    fontSize: 13,
    textAlign: "center",
  },
};
