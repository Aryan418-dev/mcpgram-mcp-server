import { McpgramApi } from "../api.js";
import { configFromApiKey } from "../config.js";
import { logger } from "../logger.js";
import { isAuth0Configured, verifyAuth0AccessToken } from "../oauth/auth0.js";
import { resolveApiKeyFromAuth0 } from "../oauth/resolve-user.js";
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
 * 1. Raw mcpg_* API keys (stdio / direct)
 * 2. Auth0 JWT → per-user workspace API key (never a global env key)
 * 3. Legacy homegrown OAuth tokens
 */
export async function resolveApiKeyFromBearer(token: string): Promise<string> {
  if (!token || token.length < 8) {
    throw new AuthError("Missing or malformed Authorization Bearer token");
  }

  if (token.startsWith("mcpg_")) {
    return validateApiKey(token);
  }

  if (isAuth0Configured()) {
    const claims = await verifyAuth0AccessToken(token);
    if (claims) {
      try {
        const { apiKey, userId, workspaceId } = await resolveApiKeyFromAuth0(
          claims,
          token
        );
        logger.info("Auth0 JWT → workspace key", { userId, workspaceId });
        return apiKey;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Auth0 workspace resolution failed", { message });
        throw new AuthError(`Workspace resolution failed: ${message}`, 403);
      }
    }
  }

  try {
    const claims = verifyAccessToken(token);
    if (claims?.api_key) {
      return claims.api_key;
    }
  } catch {
    // fall through
  }

  return validateApiKey(token);
}

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

export async function authenticateRequest(req: Request): Promise<string> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new AuthError(
      "Missing Authorization header. Complete OAuth (Auth0) or use Bearer <MCPGRAM_API_KEY>"
    );
  }
  return resolveApiKeyFromBearer(token);
}
