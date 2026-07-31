import { randomId, signPayload, verifyPayload } from "./crypto.js";
import type { OAuthClientRecord } from "./types.js";

/**
 * Stateless Dynamic Client Registration.
 * client_id encodes the registration (signed). No DB required.
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
  const client_id = `cli_${randomId(12)}`;
  const record: OAuthClientRecord = {
    typ: "client",
    client_id,
    client_name: input.client_name,
    redirect_uris: input.redirect_uris,
    token_endpoint_auth_method: input.token_endpoint_auth_method ?? "none",
    iat,
  };
  // Embed full record in a second signed blob stored as client_secret-less:
  // We return client_id and keep a parallel signed token in a cookie is not needed;
  // instead encode record into client_id itself.
  const encoded = `cli_${signPayload(record)}`;
  return {
    client_id: encoded,
    client_id_issued_at: iat,
    redirect_uris: input.redirect_uris,
  };
}

export function loadClient(client_id: string): OAuthClientRecord | null {
  if (!client_id?.startsWith("cli_")) return null;
  const token = client_id.slice(4);
  // If client_id is the signed payload form
  const rec = verifyPayload<OAuthClientRecord>(token);
  if (rec && rec.typ === "client") return rec;
  return null;
}

export function clientAllowsRedirect(client: OAuthClientRecord, redirect_uri: string): boolean {
  return client.redirect_uris.includes(redirect_uri);
}
