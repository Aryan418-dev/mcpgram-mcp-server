import type { Config } from "./config.js";

/** Build headers for every MCPGRAM API request. */
export function authHeaders(
  config: Config,
  clientHeaders?: Headers
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "mcpgram-mcp-server/1.5.0",
  };

  if (clientHeaders) {
    const ua = clientHeaders.get("user-agent");
    if (ua) headers["X-Forwarded-User-Agent"] = ua.slice(0, 512);

    const agent =
      clientHeaders.get("x-mcpgram-agent") ||
      clientHeaders.get("x-client-name") ||
      clientHeaders.get("x-mcp-client");
    if (agent) headers["X-MCPGRAM-Agent"] = agent.slice(0, 64);
  }

  return headers;
}
