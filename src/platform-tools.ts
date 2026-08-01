import type { Config } from "./config.js";
import { allApiKeys, configFromApiKey } from "./config.js";
import { McpgramApi, ApiError } from "./api.js";
import type { McpToolResult } from "./execute.js";
import { logger } from "./logger.js";

export type PlatformToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const emptySchema = { type: "object", properties: {}, additionalProperties: false };

export const PLATFORM_TOOLS: PlatformToolDef[] = [
  { name: "mcpgram_health", description: "MCPGRAM bridge health and authorized workspaces.", inputSchema: emptySchema },
  { name: "mcpgram_workspace_info", description: "Workspaces granted to this OAuth session.", inputSchema: emptySchema },
  { name: "mcpgram_list_servers", description: "List connected servers/connectors and tool counts.", inputSchema: { type: "object", properties: { workspace_id: { type: "string" } }, additionalProperties: false } },
  { name: "mcpgram_list_workspace_tools", description: "List connector tools in authorized workspaces.", inputSchema: { type: "object", properties: { workspace_id: { type: "string" }, server: { type: "string" } }, additionalProperties: false } },
  { name: "mcpgram_search_tools", description: "Search connector tools by name/description.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"], additionalProperties: false } },
  { name: "mcpgram_how_to_add_tools", description: "How to connect apps so tools appear in Claude.", inputSchema: emptySchema },
];

export function isPlatformTool(name: string): boolean {
  return name.startsWith("mcpgram_");
}

function textResult(data: unknown, isError = false): McpToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

async function listAllServers(config: Config) {
  const keys = allApiKeys(config);
  const out: Array<{ workspace_id?: string; workspace_name?: string; servers: Array<{ server_id: string; name: string; status: string; tool_count: number; tools: Array<{ tool_id: string; name: string; description: string | null }> }>; error?: string }> = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const wsId = config.workspaceIds[i];
    const wsName = wsId ? config.workspaceNames[wsId] : undefined;
    try {
      const api = new McpgramApi(configFromApiKey(key));
      const data = await api.listTools();
      out.push({
        workspace_id: wsId,
        workspace_name: wsName,
        servers: (data.servers ?? []).map((s) => ({
          server_id: s.server_id,
          name: s.name,
          status: s.status,
          tool_count: s.tools?.length ?? 0,
          tools: (s.tools ?? []).map((t) => ({ tool_id: t.tool_id, name: t.name, description: t.description })),
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("platform listTools failed", { i, message });
      out.push({ workspace_id: wsId, workspace_name: wsName, servers: [], error: message });
    }
  }
  return out;
}

export async function executePlatformTool(config: Config, name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  try {
    switch (name) {
      case "mcpgram_health": {
        const catalogs = await listAllServers(config);
        const toolCount = catalogs.reduce((n, c) => n + c.servers.reduce((m, s) => m + s.tool_count, 0), 0);
        return textResult({
          ok: true,
          service: "mcpgram-mcp-server",
          workspaces_authorized: config.workspaceIds.length || catalogs.length,
          workspace_ids: config.workspaceIds,
          connector_tool_count: toolCount,
          platform_tools: PLATFORM_TOOLS.map((t) => t.name),
          tip: toolCount === 0 ? "No connector tools yet. Connect apps at https://mcpgram.vercel.app then reconnect Claude." : "Connector tools available alongside platform tools.",
        });
      }
      case "mcpgram_workspace_info": {
        const ids = config.workspaceIds;
        if (!ids.length) return textResult({ mode: "api_key", user_id: config.userId ?? null });
        return textResult({ mode: "oauth", user_id: config.userId ?? null, workspaces: ids.map((id) => ({ id, name: config.workspaceNames[id] ?? null })) });
      }
      case "mcpgram_list_servers": {
        const filterWs = typeof args.workspace_id === "string" ? args.workspace_id : null;
        let catalogs = await listAllServers(config);
        if (filterWs) catalogs = catalogs.filter((c) => c.workspace_id === filterWs);
        return textResult({ workspaces: catalogs.map((c) => ({ workspace_id: c.workspace_id ?? null, workspace_name: c.workspace_name ?? null, error: c.error ?? null, servers: c.servers.map((s) => ({ server_id: s.server_id, name: s.name, status: s.status, tool_count: s.tool_count })) })) });
      }
      case "mcpgram_list_workspace_tools": {
        const filterWs = typeof args.workspace_id === "string" ? args.workspace_id : null;
        const serverFilter = typeof args.server === "string" ? args.server.toLowerCase() : null;
        let catalogs = await listAllServers(config);
        if (filterWs) catalogs = catalogs.filter((c) => c.workspace_id === filterWs);
        const tools: Array<Record<string, unknown>> = [];
        for (const c of catalogs) {
          for (const s of c.servers) {
            if (serverFilter && !s.name.toLowerCase().includes(serverFilter)) continue;
            for (const t of s.tools) tools.push({ workspace_id: c.workspace_id ?? null, server: s.name, tool_id: t.tool_id, name: t.name, description: t.description });
          }
        }
        return textResult({ count: tools.length, tools, empty_hint: tools.length === 0 ? "Connect apps at https://mcpgram.vercel.app" : null });
      }
      case "mcpgram_search_tools": {
        const query = String(args.query ?? "").toLowerCase().trim();
        if (!query) return textResult({ error: "query is required" }, true);
        const limit = typeof args.limit === "number" && args.limit > 0 ? Math.min(args.limit, 100) : 25;
        const catalogs = await listAllServers(config);
        const matches: Array<Record<string, unknown>> = [];
        for (const c of catalogs) {
          for (const s of c.servers) {
            for (const t of s.tools) {
              if (`${s.name} ${t.name} ${t.description ?? ""}`.toLowerCase().includes(query)) {
                matches.push({ workspace_id: c.workspace_id ?? null, server: s.name, tool_id: t.tool_id, name: t.name, description: t.description });
              }
              if (matches.length >= limit) break;
            }
            if (matches.length >= limit) break;
          }
          if (matches.length >= limit) break;
        }
        return textResult({ query, count: matches.length, matches });
      }
      case "mcpgram_how_to_add_tools":
        return textResult({ steps: ["Open https://mcpgram.vercel.app", "Sign in with the same account", "Connect GitHub/Slack/etc in the authorized workspace", "Reconnect Claude MCP connector", "Call mcpgram_list_workspace_tools"], note: "Platform tools (mcpgram_*) always appear; connector tools need apps connected." });
      default:
        return textResult(`Unknown platform tool: ${name}`, true);
    }
  } catch (err) {
    if (err instanceof ApiError) return textResult(`MCPGRAM API error (${err.status}): ${err.message}`, true);
    return textResult(`Platform tool failed: ${err instanceof Error ? err.message : String(err)}`, true);
  }
}
