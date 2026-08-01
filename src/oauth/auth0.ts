/**
 * Auth0 as MCP Authorization Server (resource-server mode).
 * Claude talks to Auth0 for login/DCR/token; this server only verifies JWTs.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Auth0 issuer base, e.g. https://tenant.us.auth0.com (no trailing slash). */
export function auth0Issuer(): string | null {
  const raw = process.env.AUTH0_DOMAIN?.trim();
  if (!raw) return null;
  const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** Issuer claim Auth0 puts in tokens (usually with trailing slash). */
export function auth0IssuerWithSlash(): string | null {
  const base = auth0Issuer();
  return base ? `${base}/` : null;
}

export function auth0Audience(): string | null {
  const a = process.env.AUTH0_AUDIENCE?.trim();
  return a || null;
}

export function isAuth0Configured(): boolean {
  return Boolean(auth0Issuer() && auth0Audience());
}

function getJwks() {
  const issuer = auth0Issuer();
  if (!issuer) throw new Error("AUTH0_DOMAIN not set");
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  }
  return jwks;
}

export type Auth0Claims = JWTPayload & {
  sub: string;
  scope?: string;
  permissions?: string[];
  email?: string;
};

/**
 * Verify an Auth0 access token. Returns claims or null if not an Auth0 JWT / invalid.
 */
export async function verifyAuth0AccessToken(token: string): Promise<Auth0Claims | null> {
  if (!isAuth0Configured()) return null;
  if (token.split(".").length !== 3) return null;

  const issuer = auth0IssuerWithSlash();
  const audience = auth0Audience();
  if (!issuer || !audience) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer,
      audience,
    });
    if (!payload.sub) return null;
    return payload as Auth0Claims;
  } catch {
    try {
      const base = auth0Issuer();
      if (!base) return null;
      const { payload } = await jwtVerify(token, getJwks(), {
        issuer: base,
        audience,
      });
      if (!payload.sub) return null;
      return payload as Auth0Claims;
    } catch {
      return null;
    }
  }
}
