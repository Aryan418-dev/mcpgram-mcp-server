import { randomId, signPayload, verifyPayload, pkceS256 } from "./crypto.js";
import type {
  AccessTokenClaims,
  AuthCodeRecord,
  RefreshTokenClaims,
  WorkspaceGrant,
} from "./types.js";

const CODE_TTL_SEC = 120;
const ACCESS_TTL_SEC = 3600;
const REFRESH_TTL_SEC = 30 * 24 * 3600;

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
  const workspaces = normalizeWorkspaces(input);
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

export function consumeAuthCode(code: string): AuthCodeRecord | null {
  const rec = verifyPayload<AuthCodeRecord>(code);
  if (!rec || rec.typ !== "code") return null;
  if (!rec.workspaces || rec.workspaces.length === 0) {
    rec.workspaces = [{ id: rec.workspace_id, api_key: rec.api_key }];
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
  const workspaces = normalizeWorkspaces(input);
  const primary = workspaces[0];
  const claims: AccessTokenClaims = {
    typ: "access",
    sub: input.sub,
    client_id: input.client_id,
    workspace_id: primary.id,
    api_key: primary.api_key,
    workspaces,
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
  workspaces?: WorkspaceGrant[];
  scope: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const workspaces = normalizeWorkspaces(input);
  const primary = workspaces[0];
  const claims: RefreshTokenClaims = {
    typ: "refresh",
    sub: input.sub,
    client_id: input.client_id,
    workspace_id: primary.id,
    api_key: primary.api_key,
    workspaces,
    scope: input.scope,
    iat: now,
    exp: now + REFRESH_TTL_SEC,
  };
  return signPayload(claims);
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  const c = verifyPayload<AccessTokenClaims>(token);
  if (!c || c.typ !== "access") return null;
  if (!c.workspaces || c.workspaces.length === 0) {
    c.workspaces = [{ id: c.workspace_id, api_key: c.api_key }];
  }
  return c;
}

export function verifyRefreshToken(token: string): RefreshTokenClaims | null {
  const c = verifyPayload<RefreshTokenClaims>(token);
  if (!c || c.typ !== "refresh") return null;
  if (!c.workspaces || c.workspaces.length === 0) {
    c.workspaces = [{ id: c.workspace_id, api_key: c.api_key }];
  }
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
