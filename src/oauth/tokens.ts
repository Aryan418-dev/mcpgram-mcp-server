import { randomId, signPayload, verifyPayload, pkceS256 } from "./crypto.js";
import type { AccessTokenClaims, AuthCodeRecord, RefreshTokenClaims } from "./types.js";

const CODE_TTL_SEC = 120;
const ACCESS_TTL_SEC = 3600;
const REFRESH_TTL_SEC = 30 * 24 * 3600;

export function issueAuthCode(input: Omit<AuthCodeRecord, "typ" | "code_id" | "exp">): string {
  const now = Math.floor(Date.now() / 1000);
  const record: AuthCodeRecord = {
    typ: "code",
    code_id: randomId(8),
    ...input,
    exp: now + CODE_TTL_SEC,
  };
  return signPayload(record);
}

export function consumeAuthCode(code: string): AuthCodeRecord | null {
  const rec = verifyPayload<AuthCodeRecord>(code);
  if (!rec || rec.typ !== "code") return null;
  return rec;
}

export function issueAccessToken(input: {
  sub: string;
  client_id: string;
  workspace_id: string;
  api_key: string;
  scope: string;
}): { access_token: string; expires_in: number; token_type: "Bearer" } {
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = {
    typ: "access",
    sub: input.sub,
    client_id: input.client_id,
    workspace_id: input.workspace_id,
    api_key: input.api_key,
    scope: input.scope,
    iat: now,
    exp: now + ACCESS_TTL_SEC,
  };
  return {
    access_token: signPayload(claims),
    expires_in: ACCESS_TTL_SEC,
    token_type: "Bearer",
  };
}

export function issueRefreshToken(input: {
  sub: string;
  client_id: string;
  workspace_id: string;
  api_key: string;
  scope: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: RefreshTokenClaims = {
    typ: "refresh",
    sub: input.sub,
    client_id: input.client_id,
    workspace_id: input.workspace_id,
    api_key: input.api_key,
    scope: input.scope,
    iat: now,
    exp: now + REFRESH_TTL_SEC,
  };
  return signPayload(claims);
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  const c = verifyPayload<AccessTokenClaims>(token);
  if (!c || c.typ !== "access") return null;
  return c;
}

export function verifyRefreshToken(token: string): RefreshTokenClaims | null {
  const c = verifyPayload<RefreshTokenClaims>(token);
  if (!c || c.typ !== "refresh") return null;
  return c;
}

export function verifyPkceChallenge(
  verifier: string,
  challenge: string,
  method: string
): boolean {
  if (method === "plain") return verifier === challenge;
  if (method === "S256") return pkceS256(verifier) === challenge;
  return false;
}
