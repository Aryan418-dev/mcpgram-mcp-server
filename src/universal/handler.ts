/**
 * Universal Layer handlers - single interface for AI agents.
 * Claude never cares whether a tool is native (GitHub) or external MCP.
 */
import type { Config } from "../config.js";
import { allApiKeys, configFromApiKey } from "../config.js";
import { McpgramApi, ApiError } from "../api.js";
import type { ToolRegistry } from "../tools.js";
import type { ResolvedTool } from "../types.js";
import { logger } from "../logger.js";
import type { McpToolResult } from "../execute.js";
import type { ProviderType } from "./types.js";

// PLACEHOLDER_RESTORE_IN_PROGRESS - full file follows in next commit
export async function executeUniversalTool(
  registry: ToolRegistry,
  api: McpgramApi,
  config: Config,
  name: string,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: "handler restore in progress" }) }],
    isError: true,
  };
}
