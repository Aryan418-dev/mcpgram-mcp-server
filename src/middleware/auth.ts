import { McpgramApi } from "../api.js";
import { configFromApiKey, type AuthSession } from "../config.js";
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
 * Resolve Bearer token to an AuthSession (one or more workspace API keys).
 * 1. Raw mcpg_* API keys (stdio / direct)
 * 2. MCPGRAM-issued OAuth access tokens (multi-workspace after consent)
 */
export async function resolveSessionFromBearer(token: string): Promise<AuthSession> {
  if (!token || token.length < 8) {
    throw new AuthError("Missing or malformed Authorization Bearer token");
  }

  if (token.startsWith("mcpg_")) {
    const key = await validateApiKey(token);
    return {
      apiKey: key,
      apiKeys: [key],
      workspaceIds: [],
      workspaceNames: {},
    };
  }

  try {
    const claims = await verifyAccessToken(token);
    if (claims?.api_key) {
      const workspaces = claims.workspaces?.length
        ? claims.workspaces
        : [{ id: claims.workspace_id, api_key: claims.api_key }];
      const apiKeys = workspaces.map((w) => w.api_key).filter(Boolean);
      const workspaceIds = workspaces.map((w) => w.id);
      const workspaceNames: Record<string, string> = {};
      for (const w of workspaces) {
        if (w.name) workspaceNames[w.id] = w.name;
      }
      logger.info("OAuth access token -> workspace key(s)", {
        workspaceIds,
        count: apiKeys.length,
        sub: claims.sub,
      });
      return {
        apiKey: claims.api_key,
        apiKeys: apiKeys.length ? apiKeys : [claims.api_key],
        workspaceIds,
        workspaceNames,
        userId: claims.sub,
      };
    }
  } catch {
    // fall through
  }

  const key = await validateApiKey(token);
  return {
    apiKey: key,
    apiKeys: [key],
    workspaceIds: [],
    workspaceNames: {},
  };
}

/** @deprecated Prefer resolveSessionFromBearer */
export async function resolveApiKeyFromBearer(token: string): Promise<string> {
  const session = await resolveSessionFromBearer(token);
  return session.apiKey;
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

export async function authenticateRequest(req: Request): Promise<AuthSession> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new AuthError(
      "Missing Authorization header. Complete OAuth or use Bearer <MCPGRAM_API_KEY>"
    );
  }
  return resolveSessionFromBearer(token);
}
