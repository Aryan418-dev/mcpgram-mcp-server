import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.OAUTH_JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "OAUTH_JWT_SECRET must be set (min 16 chars). Generate: openssl rand -hex 32"
    );
  }
  return s;
}

/** Derive a 32-byte AES key from the OAuth secret. */
function aesKey(): Buffer {
  return createHash("sha256").update(`mcpgram-aes:${secret()}`).digest();
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8");
  return b.toString("base64url");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/** Encrypt a UTF-8 string (AES-256-GCM). Output: enc.<iv>.<tag>.<ciphertext> all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc.${b64url(iv)}.${b64url(tag)}.${b64url(ct)}`;
}

/** Decrypt a value produced by encryptSecret. Pass-through for legacy plaintext. */
export function decryptSecret(value: string): string {
  if (!value.startsWith("enc.")) return value; // legacy tokens
  const parts = value.split(".");
  if (parts.length !== 4) throw new Error("invalid encrypted secret");
  const [, ivB, tagB, ctB] = parts;
  const decipher = createDecipheriv("aes-256-gcm", aesKey(), fromB64url(ivB));
  decipher.setAuthTag(fromB64url(tagB));
  return Buffer.concat([decipher.update(fromB64url(ctB)), decipher.final()]).toString("utf8");
}

/** HMAC-SHA256 sign a JSON payload → compact token. */
export function signPayload(payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify and parse a signed payload. Returns null if invalid/expired. */
export function verifyPayload<T extends Record<string, unknown>>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as T & { exp?: number };
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    return payload as T;
  } catch {
    return null;
  }
}

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Hash an opaque string for rate-limit keys (never log the raw value). */
export function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
