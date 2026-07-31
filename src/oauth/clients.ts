import { signPayload, verifyPayload } from "./crypto.js";
import type { OAuthClientRecord } from "./types.js";

/**
 * Stateless Dynamic Client Registration (RFC 7591).
 * client_id encodes a compact signed registration (redirect_uris + metadata).
 * Single HMAC — avoids double-encoding that blew up URL length for Claude.
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
