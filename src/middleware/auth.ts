import { McpgramApi } from "../api.js";
import { configFromApiKey } from "../config.js";
import { logger } from "../logger.js";
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
 * Accepts:
 *  - Raw mcpg_live_* API keys
 *  - OAuth access tokens issued by this server (signed payload with api_key)
 */
export async function resolveApiKeyFromBearer(token: string): Promise<string> {
  if (!token || token.length < 8) {
    throw new AuthError("Missing or malformed Authorization Bearer token");
  }

  // OAuth access token (our signed payload)
  if (!token.startsWith("mcpg_")) {
    try {
      const claims = verifyAccessToken(token);
      if (claims?.api_key) {
        return claims.api_key;
      }
    } catch {
      // fall through to API key validation
    }
  }

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
      "Missing Authorization header. Use OAuth or Authorization: Bearer <MCPGRAM_API_KEY>"
    );
  }
  return resolveApiKeyFromBearer(token);
}
