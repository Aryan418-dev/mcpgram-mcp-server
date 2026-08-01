import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { createServiceClient } from "../oauth/supabase.js";

function keyMaterial(): Buffer {
  const secret = process.env.MCPGRAM_KEY_SECRET || process.env.OAUTH_JWT_SECRET || "";
  if (!secret || secret.length < 16) {
    throw new Error("MCPGRAM_KEY_SECRET (or OAUTH_JWT_SECRET) required to encrypt connector tokens");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(blob: string): string {
  const [ivB, tagB, dataB] = blob.split(".");
  if (!ivB || !tagB || !dataB) throw new Error("invalid ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function upsertConnectorConnection(input: {
  userId: string;
  workspaceId: string;
  provider: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  externalAccountId?: string | null;
  externalAccountName?: string | null;
  rawMeta?: Record<string, unknown>;
}): Promise<void> {
  const admin = createServiceClient();
  const row = {
    user_id: input.userId,
    workspace_id: input.workspaceId,
    provider: input.provider,
    access_token_ciphertext: encryptSecret(input.accessToken),
    refresh_token_ciphertext: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    token_type: input.tokenType ?? "bearer",
    scope: input.scope ?? null,
    external_account_id: input.externalAccountId ?? null,
    external_account_name: input.externalAccountName ?? null,
    meta: input.rawMeta ?? {},
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("connector_connections").upsert(row, {
    onConflict: "workspace_id,provider",
  });
  if (error) throw new Error(`Failed to store connection: ${error.message}`);
}
