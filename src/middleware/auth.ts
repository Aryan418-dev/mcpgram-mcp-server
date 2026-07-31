import { McpgramApi } from "../api.js";
import { configFromApiKey } from "../config.js";
import { logger } from "../logger.js";

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
 * Validate MCPGRAM API key against the live API.
 * Returns the raw key on success; throws AuthError on failure.
 */
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

/** Authenticate an incoming HTTP Request. */
export async function authenticateRequest(req: Request): Promise<string> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new AuthError(
      "Missing Authorization header. Use: Authorization: Bearer <MCPGRAM_API_KEY>"
    );
  }
  return validateApiKey(token);
}
