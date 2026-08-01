import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  const secret =
    process.env.MCPGRAM_KEY_SECRET?.trim() ||
    process.env.OAUTH_JWT_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "Set MCPGRAM_KEY_SECRET (or OAUTH_JWT_SECRET) to encrypt per-user API keys (min 16 chars)"
    );
  }
  return createHash("sha256").update(secret).digest();
}

/** Encrypt raw API key for storage. Format: base64url(iv).base64url(tag).base64url(data) */
export function encryptApiKey(raw: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptApiKey(ciphertext: string): string {
  const key = encryptionKey();
  const parts = ciphertext.split(".");
  if (parts.length !== 3) throw new Error("Invalid key ciphertext");
  const [ivB, tagB, dataB] = parts;
  const iv = Buffer.from(ivB, "base64url");
  const tag = Buffer.from(tagB, "base64url");
  const data = Buffer.from(dataB, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
