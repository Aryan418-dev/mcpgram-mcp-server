/**
 * MCPGRAM Universal Layer — the only tools exposed to AI agents.
 * Connector-specific tools stay internal and are reached via search/execute.
 */

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
      "Search every available connector/MCP tool across authorized workspaces. Prefer this over listing all tools.",
    inputSchema: obj(
      {
        query: { type: "string", description: "Free-text query (e.g. 'github repository', 'slack message')" },
        app: { type: "string", description: "Optional app/server filter (e.g. GitHub, Slack)" },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
      },
      ["query"]
    ),
  },
  {
    name: "get_tool",
    description: "Return full metadata and input schema for a tool id from search_tools.",
    inputSchema: obj(
      { tool_id: { type: "string", description: "Stable tool id, e.g. github.create_issue" } },
      ["tool_id"]
    ),
  },
  {
    name: "get_tool_schema",
    description: "Return only the JSON Schema for a tool's arguments.",
    inputSchema: obj({ tool_id: { type: "string" } }, ["tool_id"]),
  },
  {
    name: "execute_tool",
    description:
      "Universal executor. Run any connector tool by id with arguments. Use search_tools + get_tool first when unsure.",
    inputSchema: obj(
      {
        tool_id: { type: "string", description: "Stable tool id from search_tools" },
        arguments: { type: "object", description: "Tool arguments matching its schema", additionalProperties: true },
      },
      ["tool_id"]
    ),
  },
  {
    name: "execute_batch",
    description: "Run multiple tools (parallel where possible). Each item: { tool_id, arguments }.",
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
            additionalProperties: false,
          },
        },
      },
      ["calls"]
    ),
  },
  {
    name: "execute_workflow",
    description:
      "Run tools sequentially. Failures stop the workflow unless continue_on_error is true.",
    inputSchema: obj(
      {
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tool_id: { type: "string" },
              arguments: { type: "object", additionalProperties: true },
              name: { type: "string", description: "Optional step label" },
            },
            required: ["tool_id"],
            additionalProperties: false,
          },
        },
        continue_on_error: { type: "boolean" },
      },
      ["steps"]
    ),
  },
  {
    name: "list_apps",
    description: "List every connected application/connector available to this session.",
    inputSchema: obj({ workspace_id: { type: "string" } }),
  },
  {
    name: "list_connections",
    description: "List connections with workspace, status, and tool counts.",
    inputSchema: obj({ workspace_id: { type: "string" } }),
  },
  {
    name: "connect_app",
    description:
      "Start connecting an app (GitHub, Slack, Notion, …). Returns a URL the user must open to complete OAuth.",
    inputSchema: obj(
      {
        app: { type: "string", description: "Provider id: github | slack | notion | gmail | google_drive" },
        workspace_id: { type: "string", description: "Target workspace id (optional if only one granted)" },
      },
      ["app"]
    ),
  },
  {
    name: "disconnect_app",
    description: "Instructions for disconnecting an app (managed in MCPGRAM dashboard).",
    inputSchema: obj({ app: { type: "string" }, workspace_id: { type: "string" } }, ["app"]),
  },
  {
    name: "wait_for_connection",
    description:
      "Poll until an app appears as connected (after user completes OAuth). Timeout in seconds (default 90).",
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
    description:
      "Discover tools from an external MCP HTTP endpoint (tools/list). Stores them in this session catalog.",
    inputSchema: obj(
      {
        url: { type: "string", description: "MCP server URL, e.g. https://example.com/mcp" },
        name: { type: "string", description: "Optional display name" },
      },
      ["url"]
    ),
  },
  {
    name: "refresh_tools",
    description: "Refresh the internal tool catalog from MCPGRAM and discovered MCP servers.",
    inputSchema: obj({}),
  },
  {
    name: "search_everything",
    description: "Search across apps, tools, and discovered MCP servers.",
    inputSchema: obj({ query: { type: "string" }, limit: { type: "number" } }, ["query"]),
  },
  {
    name: "explain_tool",
    description: "Natural-language explanation of what a tool does and how to call it.",
    inputSchema: obj({ tool_id: { type: "string" } }, ["tool_id"]),
  },
  {
    name: "mcpgram_health",
    description: "Health of the Universal Layer, workspaces, and catalog size.",
    inputSchema: obj({}),
  },
  {
    name: "mcpgram_workspace_info",
    description: "Workspaces granted to this OAuth/API session.",
    inputSchema: obj({}),
  },
];

export const UNIVERSAL_TOOL_NAMES = new Set(UNIVERSAL_TOOLS.map((t) => t.name));

export function isUniversalTool(name: string): boolean {
  return UNIVERSAL_TOOL_NAMES.has(name);
}
