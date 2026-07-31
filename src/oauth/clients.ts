import { signPayload, verifyPayload } from "./crypto.js";
import type { OAuthClientRecord } from "./types.js";

/**
 * Stateless Dynamic Client Registration.
 * client_id = "cli_" + HMAC-signed registration record (no DB).
 */
export function registerClient(input: {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
}): { client_id: string; client_id_issued_at: number; redirect_uris: string[] } {
  if (!input.redirect_uris?.length) {
    throw new Error("redirect_uris required");
  }
  const iat = Math.floor(Date.now() / 1000);
  const record: OAuthClientRecord = {
    typ: "client",
    client_id: "pending",
    client_name: input.client_name,
    redirect_uris: input.redirect_uris,
    token_endpoint_auth_method: input.token_endpoint_auth_method ?? "none",
    iat,
  };
  const encoded = `cli_${signPayload(record)}`;
  record.client_id = encoded;
  // Re-sign with final client_id embedded
  const client_id = `cli_${signPayload(record)}`;
  return {
    client_id,
    client_id_issued_at: iat,
    redirect_uris: input.redirect_uris,
  };
}

export function loadClient(client_id: string): OAuthClientRecord | null {
  if (!client_id?.startsWith("cli_")) return null;
  const token = client_id.slice(4);
  const rec = verifyPayload<OAuthClientRecord>(token);
  if (rec && rec.typ === "client") {
    return { ...rec, client_id };
  }
  return null;
}

export function clientAllowsRedirect(client: OAuthClientRecord, redirect_uri: string): boolean {
  return client.redirect_uris.includes(redirect_uri);
}
