import { randomId, signPayload, verifyPayload, pkceS256, encryptSecret, decryptSecret, hashKey } from "./crypto.js";
import type {
  AccessTokenClaims,
  AuthCodeRecord,
  RefreshTokenClaims,
  WorkspaceGrant,
} from "./types.js";

const CODE_TTL_SEC = 120;
const ACCESS_TTL_SEC = 3600;
const REFRESH_TTL_SEC = 30 * 24 * 3600;

/** In-process consumed auth-code ids (best-effort). Prefer Redis when configured. */
const consumedCodes = new Map<string, number>();
/** In-process revoked token ids (jti / fid). */
const revokedIds = new Map<string, number>();

function getRedis(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function redisCommand(args: (string | number)[]): Promise<unknown> {
  const r = getRedis();
  if (!r) return null;
  const res = await fetch(r.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${r.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

/** Mark auth code as used. Returns false if already consumed. */
export async function markAuthCodeUsed(codeId: string, ttlSec = CODE_TTL_SEC): Promise<boolean> {
  const key = `oauth:code:used:${codeId}`;
  try {
    const r = getRedis();
    if (r) {
      const result = await redisCommand(["SET", key, "1", "NX", "EX", ttlSec]);
      return result === "OK";
    }
  } catch (err) {
    console.error("[oauth] redis markAuthCodeUsed failed, using memory", err);
  }
  const now = Date.now();
  for (const [id, exp] of consumedCodes) {
    if (exp <= now) consumedCodes.delete(id);
  }
  if (consumedCodes.has(codeId)) return false;
  consumedCodes.set(codeId, now + ttlSec * 1000);
  return true;
}

async function isRevoked(kind: "jti" | "fid", id: string): Promise<boolean> {
  const key = `oauth:revoked:${kind}:${id}`;
  try {
    if (getRedis()) {
      const v = await redisCommand(["EXISTS", key]);
      return Number(v) === 1;
    }
  } catch (err) {
    console.error("[oauth] redis isRevoked failed", err);
  }
  const exp = revokedIds.get(`${kind}:${id}`);
  if (!exp) return false;
  if (exp <= Date.now()) {
    revokedIds.delete(`${kind}:${id}`);
    return false;
  }
  return true;
}

/** Revoke a token id (jti) or entire family (fid). */
export async function revokeTokenId(
  kind: "jti" | "fid",
  id: string,
  ttlSec: number
): Promise<void> {
  if (!id) return;
  const key = `oauth:revoked:${kind}:${id}`;
  const ttl = Math.max(60, ttlSec);
  try {
    if (getRedis()) {
      await redisCommand(["SET", key, "1", "EX", ttl]);
      return;
    }
  } catch (err) {
    console.error("[oauth] redis revokeTokenId failed", err);
  }
  revokedIds.set(`${kind}:${id}`, Date.now() + ttl * 1000);
}

function encryptGrant(g: WorkspaceGrant): WorkspaceGrant {
  return { ...g, api_key: encryptSecret(g.api_key) };
}

function decryptGrant(g: WorkspaceGrant): WorkspaceGrant {
  return { ...g, api_key: decryptSecret(g.api_key) };
}

function normalizeWorkspaces(
  input: {
    workspace_id: string;
    api_key: string;
    workspaces?: WorkspaceGrant[];
  }
): WorkspaceGrant[] {
  if (input.workspaces && input.workspaces.length > 0) {
    return input.workspaces;
  }
  return [{ id: input.workspace_id, api_key: input.api_key }];
}

export function issueAuthCode(
  input: Omit<AuthCodeRecord, "typ" | "code_id" | "exp" | "workspaces"> & {
    workspaces?: WorkspaceGrant[];
  }
): string {
  const now = Math.floor(Date.now() / 1000);
  const workspaces = normalizeWorkspaces(input).map(encryptGrant);
  const primary = workspaces[0];
  const record: AuthCodeRecord = {
    typ: "code",
    code_id: randomId(8),
    client_id: input.client_id,
    redirect_uri: input.redirect_uri,
    code_challenge: input.code_challenge,
    code_challenge_method: input.code_challenge_method,
    user_id: input.user_id,
    workspace_id: primary.id,
    api_key: primary.api_key,
    workspaces,
    scope: input.scope,
    exp: now + CODE_TTL_SEC,
  };
  return signPayload(record);
}

export async function consumeAuthCode(code: string): Promise<AuthCodeRecord | null> {
  const rec = verifyPayload<AuthCodeRecord>(code);
  if (!rec || rec.typ !== "code") return null;
  if (!rec.code_id) return null;

  const firstUse = await markAuthCodeUsed(rec.code_id);
  if (!firstUse) return null;

  try {
    if (!rec.workspaces || rec.workspaces.length === 0) {
      rec.workspaces = [{ id: rec.workspace_id, api_key: rec.api_key }];
    }
    rec.workspaces = rec.workspaces.map(decryptGrant);
    rec.api_key = decryptSecret(rec.api_key);
  } catch {
    return null;
  }
  return rec;
}

export function issueAccessToken(input: {
  sub: string;
  client_id: string;
  workspace_id: string;
  api_key: string;
  workspaces?: WorkspaceGrant[];
  scope: string;
}): { access_token: string; expires_in: number; token_type: "Bearer" } {
  const now = Math.floor(Date.now() / 1000);
  const workspaces = normalizeWorkspaces(input).map(encryptGrant);
  const primary = workspaces[0];
  const claims: AccessTokenClaims = {
    typ: "access",
    sub: input.sub,
    client_id: input.client_id,
    workspace_id: primary.id,
    api_key: primary.api_key,
    workspaces,
    scope: input.scope,
    jti: randomId(12),
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
  workspaces?: WorkspaceGrant[];
  scope: string;
  /** Reuse family id on rotation; omit to start a new family. */
  fid?: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const workspaces = normalizeWorkspaces(input).map(encryptGrant);
  const primary = workspaces[0];
  const claims: RefreshTokenClaims = {
    typ: "refresh",
    sub: input.sub,
    client_id: input.client_id,
    workspace_id: primary.id,
    api_key: primary.api_key,
    workspaces,
    scope: input.scope,
    jti: randomId(12),
    fid: input.fid || randomId(12),
    iat: now,
    exp: now + REFRESH_TTL_SEC,
  };
  return signPayload(claims);
}

function decryptClaims<T extends AccessTokenClaims | RefreshTokenClaims>(c: T): T | null {
  try {
    if (!c.workspaces || c.workspaces.length === 0) {
      c.workspaces = [{ id: c.workspace_id, api_key: c.api_key }];
    }
    c.workspaces = c.workspaces.map(decryptGrant);
    c.api_key = decryptSecret(c.api_key);
    return c;
  } catch {
    return null;
  }
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  const c = verifyPayload<AccessTokenClaims>(token);
  if (!c || c.typ !== "access") return null;
  if (c.jti && (await isRevoked("jti", c.jti))) return null;
  return decryptClaims(c);
}

/**
 * Verify refresh token. On success, caller must rotate (issue new + revoke old jti).
 * If a rotated (revoked) jti is presented again, the whole family is revoked.
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenClaims | null> {
  const c = verifyPayload<RefreshTokenClaims>(token);
  if (!c || c.typ !== "refresh") return null;

  // Legacy tokens without jti still work once, then get rotated to jti-bearing ones.
  if (c.jti) {
    if (await isRevoked("jti", c.jti)) {
      // Refresh token reuse → kill family
      if (c.fid) {
        const ttl = Math.max(60, (c.exp || 0) - Math.floor(Date.now() / 1000));
        await revokeTokenId("fid", c.fid, ttl);
      }
      return null;
    }
  }
  if (c.fid && (await isRevoked("fid", c.fid))) return null;

  return decryptClaims(c);
}

/** After successful refresh, invalidate the previous refresh jti. */
export async function rotateRefreshToken(old: RefreshTokenClaims): Promise<void> {
  if (!old.jti) return;
  const ttl = Math.max(60, (old.exp || 0) - Math.floor(Date.now() / 1000));
  await revokeTokenId("jti", old.jti, ttl);
}

/** RFC 7009-style revoke of access or refresh token. */
export async function revokePresentedToken(token: string): Promise<void> {
  const access = verifyPayload<AccessTokenClaims>(token);
  if (access?.typ === "access" && access.jti) {
    const ttl = Math.max(60, (access.exp || 0) - Math.floor(Date.now() / 1000));
    await revokeTokenId("jti", access.jti, ttl);
    return;
  }
  const refresh = verifyPayload<RefreshTokenClaims>(token);
  if (refresh?.typ === "refresh") {
    const ttl = Math.max(60, (refresh.exp || 0) - Math.floor(Date.now() / 1000));
    if (refresh.jti) await revokeTokenId("jti", refresh.jti, ttl);
    if (refresh.fid) await revokeTokenId("fid", refresh.fid, ttl);
  }
}

export function verifyPkceChallenge(
  verifier: string,
  challenge: string,
  method: string
): boolean {
  if (method === "S256" || method === "sha256" || method === "s256") {
    return pkceS256(verifier) === challenge;
  }
  return false;
}

export { hashKey };
