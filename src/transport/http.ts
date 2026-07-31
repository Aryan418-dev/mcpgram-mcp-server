/**
 * Streamable HTTP transport for remote MCP clients.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "../server.js";
import { configFromApiKey } from "../config.js";
import {
  authenticateRequest,
  AuthError,
  extractBearerToken,
} from "../middleware/auth.js";
import { globalRateLimiter } from "../middleware/rate-limit.js";
import { logger } from "../logger.js";
import { isAuth0Configured } from "../oauth/auth0.js";
import { publicBaseUrl, resourceUrl } from "../oauth/config.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Accept",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
};

/** RFC 9728 §5.1 — path-aware PRM for resource …/mcp */
function wwwAuthenticate(req: Request): string {
  const meta = `${publicBaseUrl(req)}/.well-known/oauth-protected-resource/mcp`;
  return `Bearer realm="mcpgram", resource_metadata="${meta}"`;
}

function jsonError(
  status: number,
  message: string,
  code = -32000,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
        ...extraHeaders,
      },
    }
  );
}

export async function handleMcpHttpRequest(req: Request): Promise<Response> {
  const started = Date.now();
  const method = req.method.toUpperCase();
  const url = new URL(req.url);

  logger.info("HTTP request", { method, path: url.pathname });

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (method === "GET" && url.searchParams.get("health") === "1") {
    return new Response(
      JSON.stringify({
        ok: true,
        service: "mcpgram-mcp",
        resource: resourceUrl(req),
        oauth: true,
        auth0: isAuth0Configured(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      }
    );
  }

  let apiKey: string;
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new AuthError(
        "Missing Authorization header. Complete OAuth or use Bearer API key."
      );
    }

    const rl = globalRateLimiter.check(token.slice(0, 32));
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Rate limit exceeded",
            data: { retry_after_ms: rl.retryAfterMs },
          },
          id: null,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
            ...CORS_HEADERS,
          },
        }
      );
    }

    apiKey = await authenticateRequest(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonError(err.status, err.message, -32001, {
        "WWW-Authenticate": wwwAuthenticate(req),
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Auth middleware failed", { message });
    return jsonError(500, "Authentication failed");
  }

  try {
    const config = configFromApiKey(apiKey);
    const server = createMcpServer(config);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    const response = await transport.handleRequest(req);

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      headers.set(k, v);
    }

    logger.info("HTTP response", {
      method,
      status: response.status,
      ms: Date.now() - started,
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("MCP HTTP handler error", { message });
    return jsonError(500, `Internal server error: ${message}`);
  }
}
