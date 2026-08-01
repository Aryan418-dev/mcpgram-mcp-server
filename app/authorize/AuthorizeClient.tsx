"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PERMISSIONS, styles } from "./consentStyles";

type Props = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  clientName: string;
  /** Optional logo URL for the connecting app (e.g. Claude). */
  clientLogoUrl?: string | null;
};

type Workspace = { id: string; name: string };

const MCPGRAM_LOGO = "/White-logo.png";

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
      setUser((prev) => {
        if (!u) return prev === null ? prev : null;
        if (prev && prev.id === u.id && prev.email === u.email) return prev;
        return { id: u.id, email: u.email };
      });
    });
    return () => sub.subscription.unsubscribe();
  }, [supabaseUrl, supabaseAnonKey]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const session = (await sb().auth.getSession()).data.session;
      if (!session || cancelled) return;
      const res = await fetch("/api/oauth/workspaces", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        if (!cancelled) setError("Could not load workspaces");
        return;
      }
      const json = (await res.json()) as { workspaces: Workspace[] };
      const list = (json.workspaces ?? []).filter((w) => w?.id != null);
      if (cancelled) return;
      setWorkspaces(list);
      setSelected((prev) => {
        const next: Record<string, boolean> = {};
        let changed = false;
        for (const w of list) {
          const id = String(w.id);
          if (Object.prototype.hasOwnProperty.call(prev, id)) {
            next[id] = prev[id];
          } else {
            next[id] = true;
            changed = true;
          }
        }
        for (const id of Object.keys(prev)) {
          if (!(id in next)) changed = true;
        }
        if (Object.keys(prev).length === 0) {
          for (const w of list) next[String(w.id)] = true;
          return next;
        }
        if (!changed && Object.keys(next).length === Object.keys(prev).length) {
          return prev;
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!success || !redirectUrl) return;
    const t = window.setTimeout(() => {
      window.location.href = redirectUrl;
    }, 1600);
    return () => window.clearTimeout(t);
  }, [success, redirectUrl]);

  const selectedIds = workspaces.map((w) => String(w.id)).filter((id) => selected[id] === true);
  const allSelected = workspaces.length > 0 && selectedIds.length === workspaces.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  function toggleAll() {
    if (success) return;
    const next: Record<string, boolean> = {};
    const value = !allSelected;
    for (const w of workspaces) {
      if (w?.id != null) next[String(w.id)] = value;
    }
    setSelected(next);
  }

  function toggleOne(id: string) {
    if (success) return;
    const key = String(id);
    setSelected((prev) => {
      const currentlyOn = prev[key] === true;
      return { ...prev, [key]: !currentlyOn };
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
    if (selectedIds.length === 0) {
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
    const workspace_ids = workspaces.map((w) => String(w.id)).filter((id) => selected[id] === true);
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

          <div style={{ ...styles.card, opacity: success ? 0.55 : 1 }}>
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
                  const id = String(w.id);
                  const checked = selected[id] === true;
                  return (
                    <div
                      key={id}
                      role="checkbox"
                      aria-checked={checked}
                      tabIndex={0}
                      onClick={() => toggleOne(id)}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter") {
                          e.preventDefault();
                          toggleOne(id);
                        }
                      }}
                      style={{
                        ...styles.wsRow,
                        borderColor: checked ? "#FFFFFF" : "#2A2A2A",
                        background: checked ? "#1a1a1a" : "transparent",
                        cursor: success ? "default" : "pointer",
                        userSelect: "none",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          border: checked ? "1.5px solid #FFFFFF" : "1.5px solid #2A2A2A",
                          background: checked ? "#FFFFFF" : "#000000",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        {checked ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : null}
                      </span>
                      <span style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                        <span style={{ color: "#FFFFFF", fontWeight: 500, display: "block" }}>{w.name}</span>
                        <span style={{ display: "block", fontSize: 11, color: "#6b6b6b", marginTop: 2, wordBreak: "break-all" }}>{id}</span>
                      </span>
                    </div>
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
