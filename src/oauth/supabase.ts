import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function createAnonClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `mcpg_live_${randomBytes(24).toString("hex")}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 14) };
}

export type WorkspaceRow = { id: string; name: string };

/** List workspaces the user owns/members. */
export async function listUserWorkspaces(userId: string): Promise<WorkspaceRow[]> {
  const admin = createServiceClient();
  // Prefer workspace_members if present; fall back to workspaces.owner_id
  const { data: members } = await admin
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name)")
    .eq("user_id", userId);

  if (members && members.length > 0) {
    const out: WorkspaceRow[] = [];
    for (const m of members as Array<{ workspace_id: string; workspaces: { id: string; name: string } | null }>) {
      if (m.workspaces) out.push({ id: m.workspaces.id, name: m.workspaces.name });
      else out.push({ id: m.workspace_id, name: m.workspace_id });
    }
    if (out.length) return out;
  }

  const { data: owned } = await admin
    .from("workspaces")
    .select("id, name")
    .eq("owner_id", userId);

  return (owned as WorkspaceRow[] | null) ?? [];
}

/**
 * Create a dedicated API key for Claude OAuth sessions so tools/list works
 * against the existing MCPGRAM /api/v1/* surface.
 */
export async function issueWorkspaceApiKey(
  workspaceId: string,
  label = "Claude.ai OAuth"
): Promise<string> {
  const admin = createServiceClient();
  const { raw, hash, prefix } = generateApiKey();
  const { error } = await admin.from("api_keys").insert({
    workspace_id: workspaceId,
    name: label,
    key_hash: hash,
    key_prefix: prefix,
  });
  if (error) throw new Error(`Failed to create API key: ${error.message}`);
  return raw;
}
