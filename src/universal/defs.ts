export type UniversalToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const obj = (properties: Record<string, unknown>, required?: string[]) => ({
  type: "object" as const,
  properties,
  ...(required?.length ? { required } : {}),
  additionalProperties: false,
});

export const UNIVERSAL_TOOLS: UniversalToolDef[] = [
  {
    name: "search_tools",
    description:
      "Search every available tool across native connectors and external MCP servers. Returns unified results.",
    inputSchema: obj(
      {
        query: { type: "string" },
        app: { type: "string" },
        limit: { type: "number" },
      },
      ["query"]
    ),
  },
  {
    name: "get_tool",
    description: "Full metadata + schema for a tool id from search_tools.",
    inputSchema: obj({ tool_id: { type: "string" } }, ["tool_id"]),
  },
  {
    name: "get_tool_schema",
    description: "JSON Schema for a tool's arguments.",
    inputSchema: obj({ tool_id: { type: "string" } }, ["tool_id"]),
  },
  {
    name: "execute_tool",
    description:
      "Execute any tool by id (or server_id + tool_name). Automatically routes to native connector or external MCP.",
    inputSchema: obj(
      {
        tool_id: { type: "string", description: "Stable id from search_tools, or UUID tool id" },
        server_id: { type: "string", description: "Optional MCP server id" },
        tool_name: { type: "string", description: "Optional tool name when using server_id" },
        arguments: { type: "object", additionalProperties: true },
      },
      []
    ),
  },
  {
    name: "execute_batch",
    description: "Run multiple tools in parallel.",
    inputSchema: obj(
      {
        calls: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tool_id: { type: "string" },
              arguments: { type: "object", additionalProperties: true },
            },
            required: ["tool_id"],
          },
        },
      },
      ["calls"]
    ),
  },
  {
    name: "execute_workflow",
    description: "Run tools sequentially.",
    inputSchema: obj(
      {
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tool_id: { type: "string" },
              arguments: { type: "object", additionalProperties: true },
              name: { type: "string" },
            },
            required: ["tool_id"],
          },
        },
        continue_on_error: { type: "boolean" },
      },
      ["steps"]
    ),
  },
  {
    name: "list_apps",
    description: "List connected applications (native + external MCP display names).",
    inputSchema: obj({ workspace_id: { type: "string" } }),
  },
  {
    name: "list_connections",
    description: "List connections with status and tool counts.",
    inputSchema: obj({ workspace_id: { type: "string" } }),
  },
  {
    name: "list_connected_servers",
    description:
      "List native connectors and external MCP servers with status, workspace, and tool counts.",
    inputSchema: obj({}),
  },
  {
    name: "connect_mcp_server",
    description:
      "Connect an external MCP server by URL. Validates URL, initializes handshake, discovers tools, caches schemas, and saves the server. Auth: none | bearer | api_key | basic | oauth.",
    inputSchema: obj(
      {
        url: { type: "string", description: "MCP endpoint URL, e.g. https://example.com/mcp" },
        name: { type: "string", description: "Optional display name" },
        authentication: {
          type: "object",
          properties: {
            type: { type: "string", description: "none | bearer | api_key | basic | oauth" },
            token: { type: "string" },
            api_key: { type: "string" },
            username: { type: "string" },
            password: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      ["url"]
    ),
  },
  {
    name: "disconnect_mcp_server",
    description: "Disconnect an external MCP server; removes tokens and tool cache.",
    inputSchema: obj({ server_id: { type: "string" } }, ["server_id"]),
  },
  {
    name: "refresh_server",
    description: "Reconnect and refresh tools/schemas for a connected MCP server.",
    inputSchema: obj({ server_id: { type: "string" } }, ["server_id"]),
  },
  {
    name: "discover_tools",
    description: "Force tools/list on a server, update cache, detect changes.",
    inputSchema: obj({ server_id: { type: "string" } }, ["server_id"]),
  },
  {
    name: "connect_app",
    description: "Start OAuth for a native app (github, slack, notion, …).",
    inputSchema: obj(
      { app: { type: "string" }, workspace_id: { type: "string" } },
      ["app"]
    ),
  },
  {
    name: "disconnect_app",
    description: "Guidance to disconnect a native app.",
    inputSchema: obj({ app: { type: "string" } }, ["app"]),
  },
  {
    name: "wait_for_connection",
    description: "Poll until an app appears connected after OAuth.",
    inputSchema: obj(
      {
        app: { type: "string" },
        timeout_seconds: { type: "number" },
        poll_interval_seconds: { type: "number" },
      },
      ["app"]
    ),
  },
  {
    name: "discover_mcp",
    description: "Alias of connect_mcp_server for one-shot discovery (same flow).",
    inputSchema: obj(
      {
        url: { type: "string" },
        name: { type: "string" },
        authentication: { type: "object", additionalProperties: true },
      },
      ["url"]
    ),
  },
  {
    name: "refresh_tools",
    description: "Refresh internal catalog from MCPGRAM.",
    inputSchema: obj({}),
  },
  {
    name: "search_everything",
    description: "Search apps + tools across native and external MCP.",
    inputSchema: obj({ query: { type: "string" }, limit: { type: "number" } }, ["query"]),
  },
  {
    name: "explain_tool",
    description: "Natural-language explanation of a tool.",
    inputSchema: obj({ tool_id: { type: "string" } }, ["tool_id"]),
  },
  {
    name: "mcpgram_health",
    description: "Universal Layer health + catalog size.",
    inputSchema: obj({}),
  },
  {
    name: "mcpgram_workspace_info",
    description: "Workspaces for this session.",
    inputSchema: obj({}),
  },
];

export const UNIVERSAL_TOOL_NAMES = new Set(UNIVERSAL_TOOLS.map((t) => t.name));

export function isUniversalTool(name: string): boolean {
  return UNIVERSAL_TOOL_NAMES.has(name);
}
