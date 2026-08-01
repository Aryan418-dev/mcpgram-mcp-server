/**
 * Auth0 JWT → MCPGRAM Supabase user → workspace → API key (per user).
 * Never uses a global MCPGRAM_OAUTH_API_KEY.
 */
import { createHash, randomBytes } from "node:crypto";
import { logger } from "../logger.js";
import type { Auth0Claims } from "./auth0.js";
import { auth0Issuer } from "./auth0.js";
import { decryptApiKey, encryptApiKey } from "./crypto-secret.js";
import { createServiceClient, listUserWorkspaces } from "./supabase.js";

function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `mcpg_live_${randomBytes(24).toString("hex")}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 14) };
}

async function fetchEmailFromUserinfo(accessToken: string): Promise<string | null> {
  const base = auth0Issuer();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return json.email?.toLowerCase().trim() || null;
  } catch {
    return null;
  }
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = createServiceClient();
  // Paginate admin users (Auth API has no get-by-email in all SDK versions)
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break; // safety
  }
  return null;
}

async function ensureSupabaseUser(email: string): Promise<string> {
  const existing = await findAuthUserIdByEmail(email);
  if (existing) return existing;

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { source: "auth0_claude_oauth" },
  });
  if (error) {
    // Race: user created concurrently
    const again = await findAuthUserIdByEmail(email);
    if (again) return again;
    throw new Error(`createUser failed: ${error.message}`);
  }
  if (!data.user?.id) throw new Error("createUser returned no user id");
  return data.user.id;
}

async function ensureDefaultWorkspace(userId: string, email: string): Promise<string> {
  const workspaces = await listUserWorkspaces(userId);
  if (workspaces.length > 0) return workspaces[0].id;

  const admin = createServiceClient();
  const name = email.split("@")[0] || "My Workspace";
  const { data, error } = await admin
    .from("workspaces")
    .insert({ name: `${name}'s workspace`, owner_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(`create workspace failed: ${error.message}`);
  return data.id as string;
}

async function linkIdentity(
  userId: string,
  auth0Sub: string,
  email: string,
  activeWorkspaceId: string
): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin.from("auth_identities").upsert(
    {
      user_id: userId,
      provider: "auth0",
      provider_user_id: auth0Sub,
      email,
      active_workspace_id: activeWorkspaceId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,provider_user_id" }
  );
  if (error) {
    // Table may not exist yet — surface clear message
    throw new Error(
      `auth_identities upsert failed (${error.message}). Run supabase/migrations/20260801_auth0_identities.sql`
    );
  }
}

async function getOrCreateWorkspaceApiKey(
  userId: string,
  workspaceId: string
): Promise<string> {
  const admin = createServiceClient();

  const { data: existing, error: readErr } = await admin
    .from("oauth_workspace_keys")
    .select("key_ciphertext")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (readErr) {
    throw new Error(
      `oauth_workspace_keys read failed (${readErr.message}). Run supabase/migrations/20260801_auth0_identities.sql`
    );
  }

  if (existing?.key_ciphertext) {
    try {
      return decryptApiKey(existing.key_ciphertext as string);
    } catch (e) {
      logger.warn("Failed to decrypt stored OAuth key; rotating", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const { raw, hash, prefix } = generateApiKey();
  const { data: keyRow, error: insertKeyErr } = await admin
    .from("api_keys")
    .insert({
      workspace_id: workspaceId,
      name: "Claude.ai OAuth (auto)",
      key_hash: hash,
      key_prefix: prefix,
    })
    .select("id")
    .single();

  if (insertKeyErr) {
    throw new Error(`Failed to create API key: ${insertKeyErr.message}`);
  }

  const ciphertext = encryptApiKey(raw);
  const { error: upsertErr } = await admin.from("oauth_workspace_keys").upsert(
    {
      user_id: userId,
      workspace_id: workspaceId,
      api_key_id: keyRow.id,
      key_ciphertext: ciphertext,
    },
    { onConflict: "user_id,workspace_id" }
  );
  if (upsertErr) {
    throw new Error(`oauth_workspace_keys upsert failed: ${upsertErr.message}`);
  }

  return raw;
}

/**
 * Full resolution: Auth0 claims (+ optional access token for userinfo) → MCPGRAM API key
 * scoped to that user's workspace only.
 */
export async function resolveApiKeyFromAuth0(
  claims: Auth0Claims,
  accessToken?: string
): Promise<{ apiKey: string; userId: string; workspaceId: string; email: string }> {
  const sub = claims.sub;
  if (!sub) throw new Error("Auth0 token missing sub");

  let email =
    (typeof claims.email === "string" && claims.email) ||
    (typeof (claims as { "https://mcpgram.app/email"?: string })["https://mcpgram.app/email"] ===
      "string" &&
      (claims as { "https://mcpgram.app/email"?: string })["https://mcpgram.app/email"]) ||
    null;

  if (!email && accessToken) {
    email = await fetchEmailFromUserinfo(accessToken);
  }

  if (!email) {
    throw new Error(
      "Auth0 token has no email. Enable openid profile email scopes and ensure the Auth0 API allows email in tokens, or add an Auth0 Action to add email claim."
    );
  }
  email = email.toLowerCase().trim();

  const admin = createServiceClient();

  // 1) Existing Auth0 link
  const { data: identity } = await admin
    .from("auth_identities")
    .select("user_id, active_workspace_id, email")
    .eq("provider", "auth0")
    .eq("provider_user_id", sub)
    .maybeSingle();

  let userId: string;
  if (identity?.user_id) {
    userId = identity.user_id as string;
  } else {
    // 2) Link by email to existing MCPGRAM (Supabase) user, or create
    userId = await ensureSupabaseUser(email);
  }

  // 3) Workspace: preference → membership → create default
  let workspaceId =
    (identity?.active_workspace_id as string | null) ||
    null;

  if (workspaceId) {
    // Verify still a member
    const { data: mem } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!mem) workspaceId = null;
  }

  if (!workspaceId) {
    workspaceId = await ensureDefaultWorkspace(userId, email);
  }

  await linkIdentity(userId, sub, email, workspaceId);

  const apiKey = await getOrCreateWorkspaceApiKey(userId, workspaceId);

  logger.info("Auth0 resolved to workspace", {
    sub,
    userId,
    workspaceId,
    email,
  });

  return { apiKey, userId, workspaceId, email };
}
