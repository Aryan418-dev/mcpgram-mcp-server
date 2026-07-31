/** Types mirrored from MCPGRAM public API (/api/v1/*). */

export interface McpgramTool {
  tool_id: string;
  name: string;
  description: string | null;
  input_schema: Record<string, unknown> | null;
}

export interface McpgramServer {
  server_id: string;
  name: string;
  status: string;
  tools: McpgramTool[];
}

export interface ToolsListResponse {
  servers: McpgramServer[];
}

export interface ExecuteRequest {
  tool_id: string;
  input: Record<string, unknown>;
}

export interface ExecuteResponse {
  status: "success" | "error" | null;
  error: string | null;
  output: unknown;
}

/** MCP-facing tool entry with the upstream tool_id for execution. */
export interface ResolvedTool {
  /** Unique MCP tool name (server-prefixed when needed). */
  mcpName: string;
  toolId: string;
  originalName: string;
  serverName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
