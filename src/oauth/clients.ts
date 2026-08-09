import { signPayload, verifyPayload } from "./crypto.js";
import type { OAuthClientRecord } from "./types.js";

/**
 * Allowed redirect URI patterns for Dynamic Client Registration.
 * Override / extend with OAUTH_ALLOWED_REDIRECT_HOSTS (comma-separated hostnames).
 */
const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  "claude.ai",
  "anthropic.com",
  "cursor.com",
  "cursor.sh",
  "chatgpt.com",
  "openai.com",
  "localhost",
  "127.0.0.1",
];

function allowedHostSuffixes(): string[] {
  const extra = (process.env.OAUTH_ALLOWED_REDIRECT_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_HOST_SUFFIXES, ...extra];
}

/**
 * Validate a redirect_uri is https (or localhost http) and host is allowlisted.
 */
export function isRedirectUriAllowed(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isLocal) {
    return u.protocol === "http:" || u.protocol === "https:";
  }
  if (u.protocol !== "https:") return false;
  const suffixes = allowedHostSuffixes();
  return suffixes.some((suf) => host === suf || host.endsWith(`.${suf}`));
}

export function assertRedirectUrisAllowed(uris: string[]): void {
  for (const u of uris) {
    if (!isRedirectUriAllowed(u)) {
      throw new Error(
        `redirect_uri not allowed: ${u}. Use a known agent callback (Claude, Cursor, ChatGPT) or localhost.`
      );
    }
  }
}

/**
 * Stateless Dynamic Client Registration (RFC 7591).
 * client_id encodes a compact signed registration (redirect_uris + metadata).
 */
export function registerClient(input: {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
}): { client_id: string; client_id_issued_at: number; redirect_uris: string[] } {
  if (!input.redirect_uris?.length) {
    throw new Error("redirect_uris required");
  }
  for (const u of input.redirect_uris) {
    try {
      // eslint-disable-next-line no-new
      new URL(u);
    } catch {
      throw new Error(`invalid redirect_uri: ${u}`);
    }
  }
  assertRedirectUrisAllowed(input.redirect_uris);

  const iat = Math.floor(Date.now() / 1000);
  const record: OAuthClientRecord = {
    typ: "client",
    client_id: "",
    client_name: input.client_name ?? "Claude",
    redirect_uris: input.redirect_uris,
    token_endpoint_auth_method: input.token_endpoint_auth_method ?? "none",
    iat,
  };
  const client_id = `cli_${signPayload({
    typ: record.typ,
    n: record.client_name,
    r: record.redirect_uris,
    m: record.token_endpoint_auth_method,
    iat,
  })}`;
  return {
    client_id,
    client_id_issued_at: iat,
    redirect_uris: input.redirect_uris,
  };
}

export function loadClient(client_id: string): OAuthClientRecord | null {
  if (!client_id?.startsWith("cli_")) return null;
  const token = client_id.slice(4);
  const rec = verifyPayload<{
    typ: string;
    n?: string;
    r?: string[];
    m?: string;
    iat?: number;
  }>(token);
  if (!rec || rec.typ !== "client" || !Array.isArray(rec.r) || !rec.r.length) {
    return null;
  }
  return {
    typ: "client",
    client_id,
    client_name: rec.n,
    redirect_uris: rec.r,
    token_endpoint_auth_method: rec.m ?? "none",
    iat: rec.iat ?? 0,
  };
}

export function clientAllowsRedirect(client: OAuthClientRecord, redirect_uri: string): boolean {
  return client.redirect_uris.includes(redirect_uri);
}
