import type { Config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Notify the dashboard that an MCP client is connected so AI Agents UI
 * can show Claude / Cursor / etc. as Connected.
 * Fire-and-forget — never blocks or fails the MCP request.
 */
export function reportAgentSeen(
  config: Config,
  clientHeaders: Headers
): void {
  const base = config.baseUrl.replace(/\/+$/, "");
  const ua =
    clientHeaders.get("user-agent") ||
    clientHeaders.get("User-Agent") ||
    "";
  const agent =
    clientHeaders.get("x-mcpgram-agent") ||
    clientHeaders.get("x-client-name") ||
    clientHeaders.get("x-mcp-client") ||
    "";

  const keys = [config.apiKey, ...(config.extraApiKeys ?? [])].filter(Boolean);
  // Report for primary key (and extras so multi-workspace OAuth lights up)
  for (const apiKey of keys.slice(0, 5)) {
    void fetch(`${base}/api/v1/agent-seen`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "mcpgram-mcp-server/agent-seen",
        ...(ua ? { "X-Forwarded-User-Agent": ua.slice(0, 512) } : {}),
        ...(agent ? { "X-MCPGRAM-Agent": agent.slice(0, 64) } : {}),
      },
      body: JSON.stringify({
        user_agent: ua.slice(0, 512) || undefined,
        agent: agent.slice(0, 64) || undefined,
      }),
    }).catch((err) => {
      logger.debug("agent-seen report failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
