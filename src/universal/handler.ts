/**
 * Universal Layer handlers - single interface for AI agents.
 */
import type { Config } from "../config.js";
import { allApiKeys, configFromApiKey } from "../config.js";
import { McpgramApi, ApiError } from "../api.js";
import type { ToolRegistry } from "../tools.js";
import type { ResolvedTool } from "../types.js";
import { logger } from "../logger.js";
import type { McpToolResult } from "../execute.js";
import type { ProviderType } from "./types.js";

type CatalogEntry = ResolvedTool & {
  publicId: string;
  source: "mcpgram" | "discovered_mcp";
  app: string;
  providerType: ProviderType;
};

const discovered = new Map<string, CatalogEntry>();

function textResult(data: unknown, isError = false): McpToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "app";
}

function publicId(serverName: string, toolName: string): string {
  return `${slug(serverName)}.${slug(toolName)}`;
}

function appLabel(serverName: string): string {
  const s = serverName.trim();
  if (!s) return "Unknown";
  return s.replace(/\(native\)/gi, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function isNativeName(serverName: string): boolean {
  return /\(native\)/i.test(serverName);
}

async function buildCatalog(registry: ToolRegistry, _config: Config): Promise<CatalogEntry[]> {
  const tools = await registry.refresh();
  const entries: CatalogEntry[] = tools.map((t) => ({
    ...t,
    publicId: publicId(t.serverName, t.originalName),
    source: "mcpgram" as const,
    app: appLabel(t.serverName),
    providerType: (isNativeName(t.serverName) ? "native" : "external_mcp") as ProviderType,
  }));
  for (const d of discovered.values()) entries.push(d);
  return entries;
}

function findTool(catalog: CatalogEntry[], toolId: string): CatalogEntry | undefined {
  const q = toolId.trim().toLowerCase();
  return (
    catalog.find((t) => t.publicId.toLowerCase() === q) ||
    catalog.find((t) => t.toolId.toLowerCase() === q) ||
    catalog.find((t) => t.mcpName.toLowerCase() === q) ||
    catalog.find((t) => `${t.serverName}.${t.originalName}`.toLowerCase() === q) ||
    catalog.find((t) => t.originalName.toLowerCase() === q)
  );
}

function scoreMatch(t: CatalogEntry, query: string): number {
  const q = query.toLowerCase();
  const hay = `${t.publicId} ${t.app} ${t.serverName} ${t.originalName} ${t.description} ${t.providerType}`.toLowerCase();
  if (!q) return 0;
  if (t.publicId.toLowerCase() === q) return 100;
  if (t.originalName.toLowerCase() === q) return 90;
  if (hay.includes(q)) return 70;
  let s = 0;
  for (const p of q.split(/\s+/).filter(Boolean)) if (hay.includes(p)) s += 15;
  return s;
}

async function runUpstream(
  entry: CatalogEntry,
  args: Record<string, unknown>,
  api: McpgramApi,
  config: Config
): Promise<McpToolResult> {
  if (entry.source === "discovered_mcp") {
    return textResult({ success: false, error: "Tool only discovered in-session. Call connect_mcp_server first.", tool_id: entry.publicId }, true);
  }
  const execApi = entry.apiKey && entry.apiKey !== config.apiKey ? new McpgramApi(configFromApiKey(entry.apiKey)) : api;
  const schema = entry.inputSchema as { required?: string[] };
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const missing = required.filter((k) => args[k] === undefined || args[k] === null || args[k] === "");
  if (missing.length > 0) {
    return textResult({ success: false, error: `Missing required argument(s): ${missing.join(", ")}`, missing, tool_id: entry.publicId }, true);
  }
  try {
    const result = await execApi.execute({ tool_id: entry.toolId, input: args });
    if (result.status === "error" || result.error) {
      return textResult({ success: false, error: result.error ?? "Tool execution failed", tool_id: entry.publicId }, true);
    }
    return textResult({ success: true, tool_id: entry.publicId, app: entry.app, provider_type: entry.providerType, result: result.output });
  } catch (err) {
    if (err instanceof ApiError) {
      return textResult({ success: false, error: `MCPGRAM API (${err.status}): ${err.message}`, tool_id: entry.publicId }, true);
    }
    return textResult({ success: false, error: err instanceof Error ? err.message : String(err), tool_id: entry.publicId }, true);
  }
}

function catalogServers(catalog: CatalogEntry[], workspaceId: string | null) {
  const byName = new Map<string, { name: string; tool_count: number; provider_type: ProviderType; workspace_id?: string }>();
  for (const t of catalog) {
    let row = byName.get(t.serverName);
    if (!row) {
      row = { name: t.serverName, tool_count: 0, provider_type: t.providerType, workspace_id: t.workspaceId };
      byName.set(t.serverName, row);
    }
    row.tool_count += 1;
  }
  return [...byName.values()].map((s) => ({
    server_id: slug(s.name),
    name: s.name,
    url: null as string | null,
    status: "connected",
    tool_count: s.tool_count,
    provider_type: s.provider_type,
    workspace_id: s.workspace_id ?? workspaceId,
    live_status: "connected",
    verification_status: "verified",
    health: "healthy",
    cached_tool_count: s.tool_count,
    live_tool_count: s.tool_count,
    using_cached_data: false,
    last_successful_sync: null as string | null,
    last_health_check: null as string | null,
    last_error: null as string | null,
    last_error_code: null as string | null,
    authentication_status: "unknown",
  }));
}

export async function executeUniversalTool(
  registry: ToolRegistry,
  api: McpgramApi,
  config: Config,
  name: string,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  logger.debug("universal tool", { name });

  switch (name) {
    case "refresh_tools": {
      const catalog = await buildCatalog(registry, config);
      return textResult({
        ok: true,
        tool_count: catalog.length,
        apps: [...new Set(catalog.map((t) => t.app))],
        native: catalog.filter((t) => t.providerType === "native").length,
        external_mcp: catalog.filter((t) => t.providerType === "external_mcp").length,
      });
    }

    case "search_tools": {
      const query = String(args.query ?? "");
      const appFilter = args.app ? String(args.app).toLowerCase() : "";
      const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 50);
      const catalog = await buildCatalog(registry, config);
      let ranked = catalog.map((t) => ({ t, score: scoreMatch(t, query) })).filter((x) => x.score > 0);
      if (appFilter) {
        ranked = ranked.filter((x) =>
          x.t.app.toLowerCase().includes(appFilter) ||
          x.t.serverName.toLowerCase().includes(appFilter) ||
          x.t.publicId.toLowerCase().startsWith(appFilter)
        );
      }
      ranked.sort((a, b) => b.score - a.score);
      return textResult({
        query,
        count: ranked.length,
        results: ranked.slice(0, limit).map(({ t, score }) => ({
          id: t.publicId,
          tool_id: t.toolId,
          app: t.app,
          name: t.originalName,
          description: t.description,
          provider: t.app,
          provider_type: t.providerType,
          workspace_id: t.workspaceId ?? null,
          score,
        })),
      });
    }

    case "get_tool":
    case "get_tool_schema":
    case "explain_tool": {
      const toolId = String(args.tool_id ?? "");
      const catalog = await buildCatalog(registry, config);
      const t = findTool(catalog, toolId);
      if (!t) return textResult({ error: `Unknown tool_id: ${toolId}` }, true);
      if (name === "get_tool_schema") return textResult({ tool_id: t.publicId, input_schema: t.inputSchema });
      return textResult({
        id: t.publicId,
        tool_id: t.toolId,
        app: t.app,
        name: t.originalName,
        description: t.description,
        provider_type: t.providerType,
        workspace_id: t.workspaceId ?? null,
        input_schema: t.inputSchema,
      });
    }

    case "execute_tool": {
      const toolId = String(args.tool_id ?? "").trim();
      const callArgs =
        args.arguments && typeof args.arguments === "object" && !Array.isArray(args.arguments)
          ? (args.arguments as Record<string, unknown>)
          : {};
      const catalog = await buildCatalog(registry, config);
      const t = toolId ? findTool(catalog, toolId) : undefined;
      if (!t) return textResult({ success: false, error: `Unknown tool_id: ${toolId}. Use search_tools first.` }, true);
      return runUpstream(t, callArgs, api, config);
    }

    case "list_apps":
    case "list_connections": {
      const catalog = await buildCatalog(registry, config);
      const byApp = new Map<string, { app: string; server: string; tool_count: number; provider_type: ProviderType }>();
      for (const t of catalog) {
        const key = t.serverName.toLowerCase();
        let row = byApp.get(key);
        if (!row) {
          row = { app: t.app, server: t.serverName, tool_count: 0, provider_type: t.providerType };
          byApp.set(key, row);
        }
        row.tool_count += 1;
      }
      const connections = [...byApp.values()];
      if (name === "list_apps") {
        return textResult({ apps: connections.map((c) => ({ name: c.app, server: c.server, tool_count: c.tool_count, status: "connected", provider_type: c.provider_type })) });
      }
      return textResult({ connections });
    }

    case "list_connected_servers": {
      // Catalog-first: never surface "Invalid or revoked API key" to agents
      const catalog = await buildCatalog(registry, config);
      const serversFromCatalog = catalogServers(catalog, config.workspaceIds[0] ?? null);
      try {
        const data = await api.listMcpServers();
        if (data.servers && data.servers.length > 0) {
          const byServer = new Map<string, number>();
          for (const t of catalog) {
            const k = t.serverName.toLowerCase();
            byServer.set(k, (byServer.get(k) ?? 0) + 1);
          }
          const servers = data.servers.map((s) => {
            const tool_count = s.tool_count ?? byServer.get(s.name.toLowerCase()) ?? 0;
            const live_status =
              s.live_status ??
              (s.status === "verified" && !s.last_error ? "connected" : s.status === "failed" ? "error" : "unknown");
            return {
              server_id: s.server_id,
              name: s.name,
              url: s.url ?? null,
              status: s.status,
              tool_count,
              provider_type: (s.provider_type === "native" ? "native" : "external_mcp") as ProviderType,
              workspace_id: data.workspace_id ?? null,
              live_status,
              verification_status: s.verification_status ?? s.status,
              health: s.health ?? (live_status === "connected" ? "healthy" : "unknown"),
              cached_tool_count: s.cached_tool_count ?? tool_count,
              live_tool_count: s.live_tool_count ?? (live_status === "connected" ? tool_count : 0),
              using_cached_data: Boolean(s.using_cached_data),
              last_successful_sync: s.last_successful_sync ?? null,
              last_health_check: s.last_health_check ?? s.last_checked_at ?? null,
              last_error: s.last_error ?? null,
              last_error_code: s.last_error_code ?? null,
              authentication_status: s.authentication_status ?? "unknown",
            };
          });
          return textResult({
            workspace_id: data.workspace_id ?? null,
            count: servers.length,
            servers,
            native: servers.filter((s) => s.provider_type === "native"),
            external_mcp: servers.filter((s) => s.provider_type === "external_mcp"),
            source: "api",
          });
        }
      } catch (err) {
        logger.warn("list_connected_servers: dashboard API unavailable, using tool catalog", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return textResult({
        workspace_id: config.workspaceIds[0] ?? null,
        count: serversFromCatalog.length,
        servers: serversFromCatalog,
        native: serversFromCatalog.filter((s) => s.provider_type === "native"),
        external_mcp: serversFromCatalog.filter((s) => s.provider_type === "external_mcp"),
        source: "catalog",
      });
    }

    case "connect_mcp_server":
    case "discover_mcp": {
      const url = String(args.url ?? "").trim();
      if (!url) return textResult({ error: "url is required" }, true);
      try {
        const result = await api.connectMcpServer({ url, name: args.name ? String(args.name).trim() : undefined });
        return textResult({ ok: true, ...result });
      } catch (err) {
        return textResult({ error: err instanceof Error ? err.message : String(err) }, true);
      }
    }

    case "disconnect_mcp_server": {
      const serverId = String(args.server_id ?? args.id ?? "").trim();
      if (!serverId) return textResult({ error: "server_id is required" }, true);
      try {
        return textResult({ ok: true, ...(await api.disconnectMcpServer(serverId)) });
      } catch (err) {
        return textResult({ error: err instanceof Error ? err.message : String(err) }, true);
      }
    }

    case "refresh_server":
    case "discover_tools": {
      const serverId = String(args.server_id ?? args.id ?? "").trim();
      if (!serverId) return textResult({ error: "server_id is required" }, true);
      try {
        const r = (await api.refreshMcpServer(serverId)) as Record<string, unknown>;
        return textResult({ ok: Boolean(r.ok ?? true), ...r });
      } catch (err) {
        return textResult({ error: err instanceof Error ? err.message : String(err) }, true);
      }
    }

    case "mcpgram_health": {
      const catalog = await buildCatalog(registry, config);
      return textResult({
        ok: true,
        layer: "universal",
        version: "2.0.0",
        catalog_size: catalog.length,
        native_tools: catalog.filter((t) => t.providerType === "native").length,
        external_mcp_tools: catalog.filter((t) => t.providerType === "external_mcp").length,
        workspaces: config.workspaceIds.length,
      });
    }

    case "mcpgram_workspace_info":
      return textResult({ workspace_ids: config.workspaceIds, workspace_names: config.workspaceNames, api_keys: allApiKeys(config).length });

    default:
      return textResult({ error: `Unknown universal tool: ${name}` }, true);
  }
}
