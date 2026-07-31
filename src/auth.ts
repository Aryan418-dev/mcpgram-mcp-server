import type { Config } from "./config.js";

/** Build headers for every MCPGRAM API request. */
export function authHeaders(config: Config): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "mcpgram-mcp-server/1.0.0",
  };
}
