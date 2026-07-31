import { McpgramApi } from "../api.js";
import { configFromApiKey } from "../config.js";
import { logger } from "../logger.js";
import {
  apiKeyFromAuth0Claims,
  isAuth0Configured,
  verifyAuth0AccessToken,
} from "../oauth/auth0.js";
import { verifyAccessToken } from "../oauth/tokens.js";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Extract Bearer token from a Fetch Request or Authorization header value. */
export function extractBearerToken(
  requestOrHeader: Request | string | null
): string | null {
  let header: string | null;
  if (typeof requestOrHeader === "string" || requestOrHeader === null) {
    header = requestOrHeader;
  } else {
    header = requestOrHeader.headers.get("authorization");
  }
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Resolve Bearer token to a MCPGRAM API key.
 * Accepts (in order):
 *  1. Raw mcpg_* API keys
 *  2. Auth0 access tokens (JWKS) → MCPGRAM_OAUTH_API_KEY or claim mcpgram_api_key
 *  3. Legacy homegrown OAuth tokens (signed payload with api_key)
 */
export async function resolveApiKeyFromBearer(token: string): Promise<string> {
  if (!token || token.length < 8) {
    throw new AuthError("Missing or malformed Authorization Bearer token");
  }

  // 1) Direct MCPGRAM API key
  if (token.startsWith("mcpg_")) {
    return validateApiKey(token);
  }

  // 2) Auth0 JWT
  if (isAuth0Configured()) {
    const claims = await verifyAuth0AccessToken(token);
    if (claims) {
      const key = apiKeyFromAuth0Claims(claims);
      if (!key) {
        logger.error(
          "Auth0 token valid but MCPGRAM_OAUTH_API_KEY not set and no mcpgram_api_key claim"
        );
        throw new AuthError(
          "Auth0 authenticated, but server has no MCPGRAM_OAUTH_API_KEY configured",
          500
        );
      }
      logger.info("Auth0 JWT accepted", { sub: claims.sub });
      return key;
    }
  }

  // 3) Legacy homegrown OAuth access token
  try {
    const claims = verifyAccessToken(token);
    if (claims?.api_key) {
      return claims.api_key;
    }
  } catch {
    // fall through
  }

  // Last resort: treat as API key string
  return validateApiKey(token);
}

/** Validate MCPGRAM API key against the live API. */
export async function validateApiKey(apiKey: string): Promise<string> {
  if (!apiKey || apiKey.length < 8) {
    throw new AuthError("Missing or malformed Authorization Bearer token");
  }
  const config = configFromApiKey(apiKey);
  const api = new McpgramApi(config);
  const ok = await api.validateKey();
  if (!ok) {
    logger.warn("Rejected invalid MCPGRAM API key");
    throw new AuthError("Invalid or revoked API key");
  }
  return apiKey;
}

/** Authenticate an incoming HTTP Request → MCPGRAM API key. */
export async function authenticateRequest(req: Request): Promise<string> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new AuthError(
      "Missing Authorization header. Complete OAuth (Auth0) or use Bearer <MCPGRAM_API_KEY>"
    );
  }
  return resolveApiKeyFromBearer(token);
}
