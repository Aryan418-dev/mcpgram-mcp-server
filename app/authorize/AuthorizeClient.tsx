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
    window.location.href = json.redirect;
  }

  if (!sessionReady) return <p style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</p>;

  if (params.response_type !== "code" || !params.client_id || !params.redirect_uri || !params.code_challenge) {
    return (
      <main style={page}>
        <h1>Invalid authorization request</h1>
        <p>Missing required OAuth parameters.</p>
      </main>
    );
  }

  return (
    <main style={page}>
      <h1 style={{ marginTop: 0 }}>Connect MCPGRAM to Claude</h1>
      <p style={{ color: "#555" }}>Choose which workspaces Claude can access.</p>

      {!user ? (
        <div style={card}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Sign in</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button type="button" style={btnSecondary} disabled={busy} onClick={() => signInProvider("google")}>Google</button>
            <button type="button" style={btnSecondary} disabled={busy} onClick={() => signInProvider("github")}>GitHub</button>
          </div>
          <form onSubmit={signInEmail}>
            <label style={label}>Email<input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label style={label}>Password<input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <button type="submit" style={btnPrimary} disabled={busy}>{busy ? "Signing in…" : "Sign in with email"}</button>
          </form>
        </div>
      ) : (
        <div style={card}>
          <p>Signed in as <strong>{user.email ?? user.id}</strong></p>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Workspaces</span>
              <span style={{ fontSize: 12, color: "#6b7280" }}>{selectedIds.size} selected</span>
            </div>
            {workspaces.length === 0 ? (
              <p style={{ fontSize: 14, color: "#6b7280" }}>No workspaces found.</p>
            ) : (
              <div style={checkboxList}>
                <label style={checkboxRow}>
                  <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected; }} onChange={toggleAll} />
                  <span style={{ fontWeight: 600 }}>Select all workspaces</span>
                </label>
                <div style={divider} />
                {workspaces.map((w) => (
                  <label key={w.id} style={checkboxRow}>
                    <input type="checkbox" checked={selectedIds.has(w.id)} onChange={() => toggleOne(w.id)} />
                    <span>{w.name}<span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>{w.id}</span></span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" style={btnPrimary} disabled={busy || selectedIds.size === 0} onClick={approve}>
            {busy ? "Authorizing…" : selectedIds.size <= 1 ? "Allow access" : `Allow access to ${selectedIds.size} workspaces`}
          </button>
          <button type="button" style={{ ...btnSecondary, marginTop: 8, width: "100%" }} onClick={() => sb().auth.signOut()}>Sign out</button>
        </div>
      )}
      {error && <p style={{ color: "#b91c1c", marginTop: 16 }} role="alert">{error}</p>}
    </main>
  );
}

const page: React.CSSProperties = { fontFamily: "system-ui, sans-serif", maxWidth: 420, margin: "40px auto", padding: 24 };
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, background: "#fafafa" };
const label: React.CSSProperties = { display: "block", marginBottom: 12, fontSize: 14 };
const input: React.CSSProperties = { display: "block", width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", boxSizing: "border-box" };
const checkboxList: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", maxHeight: 280, overflowY: "auto", padding: "4px 0" };
const checkboxRow: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", fontSize: 14, cursor: "pointer" };
const divider: React.CSSProperties = { height: 1, background: "#f3f4f6", margin: "0 8px" };
const btnPrimary: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "none", background: "#111", color: "#fff", fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" };
