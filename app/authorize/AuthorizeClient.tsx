"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PERMISSIONS, styles } from "./consentStyles";

type Props = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  clientName: string;
  clientLogoUrl?: string | null;
};

type Workspace = { id: string; name: string };

const MCPGRAM_LOGO_SRC = "/icon-512.png";
const MCPGRAM_LOGO_WHITE_SRC = "/icon-512.png";

function McpgramLogoMark() {
  const [src, setSrc] = useState(MCPGRAM_LOGO_WHITE_SRC);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <svg width={32} height={32} viewBox="0 0 32 32" fill="none" aria-label="MCPGRAM">
        <rect x="4" y="4" width="10" height="10" rx="2" fill="#FFFFFF" />
        <rect x="18" y="4" width="10" height="10" rx="2" fill="#FFFFFF" opacity={0.85} />
        <rect x="4" y="18" width="10" height="10" rx="2" fill="#FFFFFF" opacity={0.85} />
        <rect x="18" y="18" width="10" height="10" rx="2" fill="#FFFFFF" />
      </svg>
    );
  }
  return (
    <img
      src={src}
      alt="MCPGRAM"
      width={36}
      height={36}
      style={{ display: "block", objectFit: "contain" }}
      onError={() => {
        if (src !== MCPGRAM_LOGO_SRC) setSrc(MCPGRAM_LOGO_SRC);
        else setFailed(true);
      }}
    />
  );
}

export function AuthorizeClient({ supabaseUrl, supabaseAnonKey, clientName, clientLogoUrl }: Props) {
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
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

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
    if (!user) {
      setWorkspaces([]);
      setSelected({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/oauth/workspaces", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || `Failed to load workspaces (${res.status})`);
          return;
        }
        const list: Workspace[] = Array.isArray(data.workspaces) ? data.workspaces : [];
        setWorkspaces(list);
        const next: Record<string, boolean> = {};
        for (const w of list) next[w.id] = true;
        setSelected(next);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load workspaces");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!success || !redirectUrl) return;
    const t = setTimeout(() => {
      window.location.href = redirectUrl;
    }, 900);
    return () => clearTimeout(t);
  }, [success, redirectUrl]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  async function signInProvider(provider: "google" | "github") {
    if (success) return;
    setError(null);
    setBusy(true);
    try {
      const redirectTo = window.location.href;
      const { error: err } = await sb().auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (err) setError(err.message);
    } catch (e: any) {
      setError(e?.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    if (success) return;
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await sb().auth.signInWithPassword({ email: email.trim(), password });
      if (err) setError(err.message);
    } catch (err: any) {
      setError(err?.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleWorkspace(id: string) {
    if (success) return;
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function selectAll(on: boolean) {
    if (success) return;
    const next: Record<string, boolean> = {};
    for (const w of workspaces) next[w.id] = on;
    setSelected(next);
  }

  async function approve() {
    if (busy || selectedIds.length === 0 || success) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...params,
          workspace_ids: selectedIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Authorization failed (${res.status})`);
        setBusy(false);
        return;
      }
      if (data.redirect_url) {
        setRedirectUrl(data.redirect_url);
        setSuccess(true);
      } else {
        setError("Missing redirect URL");
      }
    } catch (e: any) {
      setError(e?.message || "Authorization failed");
    } finally {
      setBusy(false);
    }
  }

  if (!sessionReady) {
    return (
      <main style={styles.page}>
        <p style={styles.mute}>Loading…</p>
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
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.35); }
          50% { box-shadow: 0 0 0 10px rgba(34, 211, 238, 0); }
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

      <div style={styles.header}>
        <div style={styles.logoBox} title={appName}>
          {clientLogoUrl && !logoFailed ? (
            <img
              src={clientLogoUrl}
              alt={appName}
              width={36}
              height={36}
              style={{ display: "block", objectFit: "contain", borderRadius: 10 }}
              onError={() => setLogoFailed(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div style={styles.clientInitial}>{appName.slice(0, 1).toUpperCase()}</div>
          )}
        </div>

        <div style={styles.connector} aria-hidden>
          {success ? (
            <div className="success-check" style={styles.successRing}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="#22d3ee" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
                    background: "rgba(34,211,238,0.85)",
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
          <McpgramLogoMark />
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
          <div style={{ display: "flex", gap: 10, marginBottom: 18, marginTop: 12 }}>
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
                autoComplete="email"
                required
              />
            </label>
            <label style={styles.label}>
              Password
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" style={styles.btnPrimary} disabled={busy}>
              {busy ? "Signing in…" : "Continue with email"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <p style={{ ...styles.mute, marginBottom: 16, fontSize: 13, textAlign: "center" }}>
            Signed in as <span style={{ color: "#FAFAFA" }}>{user.email ?? user.id}</span>
          </p>

          <div style={{ ...styles.card, opacity: success ? 0.55 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={styles.cardTitle}>Choose Workspace</span>
              <button
                type="button"
                style={styles.selectAllBtn}
                disabled={workspaces.length === 0 || success}
                onClick={() => selectAll(selectedIds.length !== workspaces.length)}
              >
                {selectedIds.length === workspaces.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            {workspaces.length === 0 ? (
              <p style={styles.mute}>No workspaces found.</p>
            ) : (
              <div style={styles.checkboxList} role="group" aria-label="Workspaces">
                {workspaces.map((w) => {
                  const id = w.id;
                  const checked = !!selected[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleWorkspace(id)}
                      disabled={success}
                      style={{
                        ...styles.wsRow,
                        borderColor: checked ? "#22d3ee" : "rgba(148,163,184,0.25)",
                        background: checked ? "rgba(34,211,238,0.08)" : "transparent",
                        cursor: success ? "default" : "pointer",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          border: checked ? "1.5px solid #22d3ee" : "1.5px solid rgba(148,163,184,0.35)",
                          background: checked ? "#22d3ee" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        {checked ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#07080c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : null}
                      </span>
                      <span style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                        <span style={{ color: "#FAFAFA", fontWeight: 500, display: "block" }}>{w.name}</span>
                        <span style={{ display: "block", fontSize: 11, color: "rgba(161,161,170,0.75)", marginTop: 2, wordBreak: "break-all" }}>{id}</span>
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
                    opacity: busy || selectedIds.length === 0 ? 0.5 : 1,
                    cursor: busy || selectedIds.length === 0 ? "not-allowed" : "pointer",
                  }}
                  disabled={busy || selectedIds.length === 0}
                  onClick={approve}
                >
                  {busy
                    ? "Authorizing…"
                    : selectedIds.length <= 1
                      ? "Authorize"
                      : `Authorize ${selectedIds.length} workspaces`}
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
