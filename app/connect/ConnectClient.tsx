"use client";

import { useEffect, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { styles } from "../authorize/consentStyles";

type Props = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  publicUrl: string;
  appRedirectUrl: string;
  providers: {
    id: string;
    name: string;
    description: string;
    logoUrl: string;
    configured: boolean;
  }[];
  initialError?: string | null;
};

type Workspace = { id: string; name: string };

const MCPGRAM_LOGO = "/logo-on-dark.png";

export function ConnectClient({
  supabaseUrl,
  supabaseAnonKey,
  publicUrl,
  appRedirectUrl,
  providers,
  initialError,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

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
      if (list[0] && !workspaceId) setWorkspaceId(String(list[0].id));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const selectedIds = providers.map((p) => p.id).filter((id) => selected[id] === true);

  function toggleOne(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !(prev[id] === true) }));
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

  async function startConnect() {
    if (!workspaceId) {
      setError("Select a workspace");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Select at least one app");
      return;
    }
    const session = (await sb().auth.getSession()).data.session;
    if (!session) {
      setError("Not signed in");
      return;
    }
    const next = selectedIds[0];
    const cfg = providers.find((p) => p.id === next);
    if (!cfg?.configured) {
      setError(`${cfg?.name ?? next} is not configured on the server yet`);
      return;
    }
    setBusy(true);
    setError(null);
    const start = new URL(`${publicUrl}/api/connect/${next}/start`);
    start.searchParams.set("workspace_id", workspaceId);
    start.searchParams.set("access_token", session.access_token);
    window.location.href = start.toString();
  }

  if (!sessionReady) {
    return (
      <main style={styles.page}>
        <p style={{ color: "#BDBDBD", textAlign: "center" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div style={styles.logoBox} title="Apps">
          <div style={styles.clientInitial}>+</div>
        </div>
        <div style={styles.connector} aria-hidden>
          <div style={styles.tileRow}>
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  background: "#FFFFFF",
                  borderRadius: 1.5,
                  display: "inline-block",
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
        </div>
        <div style={styles.logoBox} title="MCPGRAM">
          <img src={MCPGRAM_LOGO} alt="MCPGRAM" width={32} height={32} style={{ display: "block", objectFit: "contain" }} />
        </div>
      </div>

      <h1 style={styles.title}>Connect apps to MCPGRAM</h1>
      <p style={styles.subtitle}>
        Choose GitHub, Slack, Notion, and more. You will authorize each app, then return here.
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
              <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label style={styles.label}>
              Password
              <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
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

          <div style={styles.card}>
            <div style={{ ...styles.cardTitle, marginBottom: 12 }}>Workspace</div>
            {workspaces.length === 0 ? (
              <p style={styles.mute}>No workspaces found.</p>
            ) : (
              <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} style={{ ...styles.input, marginTop: 0 }}>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ ...styles.card, marginTop: 12 }}>
            <div style={{ ...styles.cardTitle, marginBottom: 8 }}>Apps</div>
            <div style={styles.checkboxList} role="group" aria-label="Apps">
              {providers.map((p) => {
                const checked = selected[p.id] === true;
                return (
                  <div
                    key={p.id}
                    role="checkbox"
                    aria-checked={checked}
                    tabIndex={0}
                    onClick={() => toggleOne(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggleOne(p.id);
                      }
                    }}
                    style={{
                      ...styles.wsRow,
                      borderColor: checked ? "#FFFFFF" : "#2A2A2A",
                      background: checked ? "#1a1a1a" : "transparent",
                      opacity: p.configured ? 1 : 0.55,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <img src={p.logoUrl} alt="" width={28} height={28} style={{ borderRadius: 8, objectFit: "contain", flexShrink: 0 }} referrerPolicy="no-referrer" />
                    <span style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                      <span style={{ color: "#FFFFFF", fontWeight: 500, display: "block" }}>
                        {p.name}
                        {!p.configured ? " · setup required" : ""}
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: "#6b6b6b", marginTop: 2 }}>{p.description}</span>
                    </span>
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
                      }}
                    >
                      {checked ? (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              style={{
                ...styles.btnPrimary,
                opacity: busy || selectedIds.length === 0 || !workspaceId ? 0.5 : 1,
                cursor: busy || selectedIds.length === 0 || !workspaceId ? "not-allowed" : "pointer",
              }}
              disabled={busy || selectedIds.length === 0 || !workspaceId}
              onClick={startConnect}
            >
              {busy ? "Redirecting…" : "Continue"}
            </button>
            <button type="button" style={styles.btnSecondary} onClick={() => { window.location.href = appRedirectUrl; }} disabled={busy}>
              Skip for now
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
