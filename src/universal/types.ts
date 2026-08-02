/** Unified tool shape — Claude never cares if the backend is native or external MCP. */
export type ProviderType = "native" | "external_mcp";

export interface UniversalTool {
  id: string;
  name: string;
  provider: string;
  providerType: ProviderType;
  description?: string;
  schema?: Record<string, unknown> | null;
  serverId?: string;
  toolId?: string;
  workspaceId?: string;
}

export interface ConnectedServer {
  server_id: string;
  name: string;
  url?: string;
  status: string;
  tool_count: number;
  provider_type: ProviderType;
  workspace_id?: string;
}
