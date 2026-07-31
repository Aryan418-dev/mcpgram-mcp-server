"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Props = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

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
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  function sb(): SupabaseClient {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured on this server (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)");
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const json = (await res.json()) as { workspaces: Array<{ id: string; name: string }> };
      setWorkspaces(json.workspaces ?? []);
      if (json.workspaces?.[0]) setWorkspaceId(json.workspaces[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await sb().auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  async function signInProvider(provider: "google" | "github") {
    setBusy(true);
    setError(null);
    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function approve() {
    if (!workspaceId) {
      setError("Select a workspace");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = (await sb().auth.getSession()).data.session;
      if (!session) {
        setError("Not signed in");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/oauth/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ...params, workspace_id: workspaceId }),
      });
      const json = (await res.json()) as { redirect?: string; error?: string };
      if (!res.ok || !json.redirect) {
        setError(json.error ?? "Approval failed");
        setBusy(false);
        return;
      }
      window.location.href = json.redirect;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!sessionReady) {
    return <p style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</p>;
  }

  if (
    params.response_type !== "code" ||
    !params.client_id ||
    !params.redirect_uri ||
    !params.code_challenge
  ) {
    return (
      <main style={page}>
        <h1>Invalid authorization request</h1>
        <p>Missing required OAuth parameters (response_type=code, client_id, redirect_uri, code_challenge).</p>
      </main>
    );
  }

  return (
    <main style={page}>
      <h1 style={{ marginTop: 0 }}>Connect MCPGRAM to Claude</h1>
      <p style={{ color: "#555" }}>Claude is requesting access to your MCPGRAM workspace tools.</p>

      {!user ? (
        <div style={card}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Sign in</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button type="button" style={btnSecondary} disabled={busy} onClick={() => signInProvider("google")}>
              Google
            </button>
            <button type="button" style={btnSecondary} disabled={busy} onClick={() => signInProvider("github")}>
              GitHub
            </button>
          </div>
          <form onSubmit={signInEmail}>
            <label style={label}>
              Email
              <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label style={label}>
              Password
              <input
                style={input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" style={btnPrimary} disabled={busy}>
              {busy ? "Signing in…" : "Sign in with email"}
            </button>
          </form>
        </div>
      ) : (
        <div style={card}>
          <p>
            Signed in as <strong>{user.email ?? user.id}</strong>
          </p>
          <label style={label}>
            Workspace
            <select style={input} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
              {workspaces.length === 0 && <option value="">No workspaces found</option>}
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" style={btnPrimary} disabled={busy || !workspaceId} onClick={approve}>
            {busy ? "Authorizing…" : "Allow access"}
          </button>
          <button
            type="button"
            style={{ ...btnSecondary, marginTop: 8, width: "100%" }}
            onClick={() => sb().auth.signOut()}
          >
            Sign out
          </button>
        </div>
      )}

      {error && (
        <p style={{ color: "#b91c1c", marginTop: 16 }} role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

const page: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  maxWidth: 420,
  margin: "40px auto",
  padding: 24,
};
const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 20,
  background: "#fafafa",
};
const label: React.CSSProperties = {
  display: "block",
  marginBottom: 12,
  fontSize: 14,
};
const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  boxSizing: "border-box",
};
const btnPrimary: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  flex: 1,
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
};
