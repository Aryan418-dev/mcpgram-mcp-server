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

// TEMP_MARKER_WILL_REPLACE_FULL
export async function executeUniversalTool() { return { content: [{ type: "text", text: "restoring" }] }; }
