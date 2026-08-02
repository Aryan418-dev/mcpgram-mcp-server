import type { Config } from "../config.js";
import { allApiKeys, configFromApiKey } from "../config.js";
import { McpgramApi, ApiError } from "../api.js";
import type { ToolRegistry } from "../tools.js";
import type { ResolvedTool } from "../types.js";
import { logger } from "../logger.js";
import type { McpToolResult } from "../execute.js";

type CatalogEntry = ResolvedTool & {
  publicId: string;
  source: "mcpgram" | "discovered_mcp";
  app: string;
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
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function buildCatalog(registry: ToolRegistry, _config: Config): Promise<CatalogEntry[]> {
  const tools = await registry.refresh();
  const entries: CatalogEntry[] = tools.map((t) => ({
    ...t,
    publicId: publicId(t.serverName, t.originalName),
    source: "mcpgram" as const,
    app: appLabel(t.serverName),
  }));
  for (const d of discovered.values()) entries.push(d);
  return entries;
}

function findTool(catalog: CatalogEntry[], toolId: string): CatalogEntry | undefined {
  const q = toolId.trim().toLowerCase();
  return (
    catalog.find((t) => t.publicId.toLowerCase() === q) ||
    catalog.find((t) => t.toolId.toLowerCase() === q) ||
    catalog.find((t) => t.mcpName.toLowerCase() === q)
  );
}

function scoreMatch(t: CatalogEntry, query: string): number {
  const q = query.toLowerCase();
  const hay = `${t.publicId} ${t.app} ${t.serverName} ${t.originalName} ${t.description}`.toLowerCase();
  if (!q) return 0;
  if (t.publicId.toLowerCase() === q) return 100;
  if (hay.includes(q)) return 70;
  return q.split(/\s+/).filter((p) => hay.includes(p)).length * 15;
}

async function runUpstream(
  entry: CatalogEntry,
  args: Record<string, unknown>,
  api: McpgramApi,
  config: Config
): Promise<McpToolResult> {
  if (entry.source === "discovered_mcp") {
    return textResult(
      { success: false, error: "Discovered MCP execute not wired yet", tool_id: entry.publicId },
      true
    );
  }
  const execApi =
    entry.apiKey && entry.apiKey !== config.apiKey
      ? new McpgramApi(configFromApiKey(entry.apiKey))
      : api;
  try {
    const result = await execApi.execute({ tool_id: entry.toolId, input: args });
    if (result.status === "error" || result.error) {
      return textResult({ success: false, error: result.error ?? "failed", tool_id: entry.publicId }, true);
    }
    return textResult({ success: true, tool_id: entry.publicId, app: entry.app, result: result.output });
  } catch (err) {
    if (err instanceof ApiError) {
      return textResult({ success: false, error: `API ${err.status}: ${err.message}`, tool_id: entry.publicId }, true);
    }
    return textResult({ success: false, error: err instanceof Error ? err.message : String(err), tool_id: entry.publicId }, true);
  }
}

function connectUrl(app: string, workspaceId: string | undefined, config: Config): string {
  const dash = (process.env.MCPGRAM_APP_URL || config.baseUrl || "https://mcpgram.vercel.app").replace(/\/+$/, "");
  const provider = slug(app).replace(/_/g, "");
  if (workspaceId) return `${dash}/api/oauth/${provider}/authorize?workspace_id=${encodeURIComponent(workspaceId)}`;
  return `${dash}/dashboard?connect=${encodeURIComponent(provider)}`;
}

export async function executeUniversalTool(
  registry: ToolRegistry,
  api: McpgramApi,
  config: Config,
  name: string,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  logger.debug("universal tool", { name });

  if (name === "refresh_tools" || name === "mcpgram_health") {
    const catalog = await buildCatalog(registry, config);
    if (name === "refresh_tools") {
      return textResult({ ok: true, tool_count: catalog.length, apps: [...new Set(catalog.map((t) => t.app))] });
    }
    return textResult({
      ok: true,
      layer: "universal",
      version: "2.0.0",
      connector_tools_exposed_to_model: false,
      catalog_size: catalog.length,
      workspaces: config.workspaceIds.length,
      workspace_ids: config.workspaceIds,
      apps: [...new Set(catalog.map((t) => t.app))],
    });
  }

  if (name === "mcpgram_workspace_info") {
    return textResult({
      workspace_ids: config.workspaceIds,
      workspace_names: config.workspaceNames,
      api_keys: allApiKeys(config).length,
    });
  }

  if (name === "search_tools" || name === "search_everything") {
    const query = String(args.query ?? "");
    const appFilter = args.app ? String(args.app).toLowerCase() : "";
    const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 50);
    const catalog = await buildCatalog(registry, config);
    let ranked = catalog.map((t) => ({ t, score: scoreMatch(t, query) })).filter((x) => x.score > 0);
    if (appFilter) {
      ranked = ranked.filter(
        (x) =>
          x.t.app.toLowerCase().includes(appFilter) ||
          x.t.serverName.toLowerCase().includes(appFilter) ||
          x.t.publicId.toLowerCase().startsWith(appFilter)
      );
    }
    ranked.sort((a, b) => b.score - a.score);
    const results = ranked.slice(0, limit).map(({ t, score }) => ({
      id: t.publicId,
      app: t.app,
      name: t.originalName,
      description: t.description,
      workspace_id: t.workspaceId,
      score,
    }));
    if (name === "search_everything") {
      const apps = [...new Set(catalog.map((t) => t.app))]
        .filter((a) => !query || a.toLowerCase().includes(query.toLowerCase()))
        .map((a) => ({ type: "app", name: a }));
      return textResult({ query, apps, tools: results.map((r) => ({ type: "tool", ...r })) });
    }
    return textResult({ query, count: results.length, results });
  }

  if (name === "get_tool" || name === "get_tool_schema" || name === "explain_tool") {
    const toolId = String(args.tool_id ?? "");
    const catalog = await buildCatalog(registry, config);
    const t = findTool(catalog, toolId);
    if (!t) return textResult({ error: `Unknown tool_id: ${toolId}` }, true);
    if (name === "get_tool_schema") return textResult({ tool_id: t.publicId, input_schema: t.inputSchema });
    if (name === "explain_tool") {
      return textResult({
        tool_id: t.publicId,
        app: t.app,
        summary: t.description,
        how_to_call: { tool: "execute_tool", arguments: { tool_id: t.publicId, arguments: {} } },
        input_schema: t.inputSchema,
      });
    }
    return textResult({
      id: t.publicId,
      app: t.app,
      name: t.originalName,
      description: t.description,
      authentication: "workspace connector OAuth via MCPGRAM",
      workspace_id: t.workspaceId,
      source: t.source,
      input_schema: t.inputSchema,
    });
  }

  if (name === "execute_tool") {
    const toolId = String(args.tool_id ?? "");
    const callArgs =
      args.arguments && typeof args.arguments === "object" && !Array.isArray(args.arguments)
        ? (args.arguments as Record<string, unknown>)
        : {};
    const catalog = await buildCatalog(registry, config);
    const t = findTool(catalog, toolId);
    if (!t) return textResult({ success: false, error: `Unknown tool_id: ${toolId}` }, true);
    return runUpstream(t, callArgs, api, config);
  }

  if (name === "execute_batch") {
    const calls = Array.isArray(args.calls) ? args.calls : [];
    if (!calls.length || calls.length > 20) return textResult({ error: "calls must be 1-20 items" }, true);
    const catalog = await buildCatalog(registry, config);
    const results = await Promise.all(
      calls.map(async (c, i) => {
        const item = c as { tool_id?: string; arguments?: Record<string, unknown> };
        const id = String(item.tool_id ?? "");
        const t = findTool(catalog, id);
        if (!t) return { index: i, tool_id: id, success: false, error: "unknown tool" };
        const r = await runUpstream(t, item.arguments ?? {}, api, config);
        let parsed: unknown = r.content?.[0]?.text;
        try { parsed = parsed ? JSON.parse(String(parsed)) : null; } catch { /* keep */ }
        return { index: i, tool_id: id, result: parsed, isError: r.isError === true };
      })
    );
    return textResult({ count: results.length, results });
  }

  if (name === "execute_workflow") {
    const steps = Array.isArray(args.steps) ? args.steps : [];
    const continueOnError = Boolean(args.continue_on_error);
    if (!steps.length || steps.length > 15) return textResult({ error: "steps must be 1-15 items" }, true);
    const catalog = await buildCatalog(registry, config);
    const history: unknown[] = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] as { tool_id?: string; arguments?: Record<string, unknown>; name?: string };
      const id = String(step.tool_id ?? "");
      const t = findTool(catalog, id);
      if (!t) {
        history.push({ step: i, tool_id: id, success: false, error: "unknown tool" });
        if (!continueOnError) return textResult({ stopped_at: i, history }, true);
        continue;
      }
      const r = await runUpstream(t, step.arguments ?? {}, api, config);
      let parsed: unknown = r.content?.[0]?.text;
      try { parsed = parsed ? JSON.parse(String(parsed)) : null; } catch { /* keep */ }
      history.push({ step: i, name: step.name, tool_id: id, result: parsed, isError: r.isError === true });
      if (r.isError && !continueOnError) return textResult({ stopped_at: i, history }, true);
    }
    return textResult({ success: true, steps: history.length, history });
  }

  if (name === "list_apps" || name === "list_connections") {
    const catalog = await buildCatalog(registry, config);
    const wsFilter = args.workspace_id ? String(args.workspace_id) : "";
    const byApp = new Map<string, { app: string; server: string; tool_count: number; workspace_ids: Set<string> }>();
    for (const t of catalog) {
      if (wsFilter && t.workspaceId && t.workspaceId !== wsFilter) continue;
      const key = t.serverName.toLowerCase();
      let row = byApp.get(key);
      if (!row) {
        row = { app: t.app, server: t.serverName, tool_count: 0, workspace_ids: new Set() };
        byApp.set(key, row);
      }
      row.tool_count += 1;
      if (t.workspaceId) row.workspace_ids.add(t.workspaceId);
    }
    const connections = [...byApp.values()].map((r) => ({
      app: r.app,
      server: r.server,
      status: "connected",
      tool_count: r.tool_count,
      workspace_ids: [...r.workspace_ids],
      connection_id: slug(r.server),
    }));
    if (name === "list_apps") {
      return textResult({ apps: connections.map((c) => ({ name: c.app, server: c.server, tool_count: c.tool_count, status: c.status })) });
    }
    return textResult({ connections });
  }

  if (name === "connect_app") {
    const app = String(args.app ?? "");
    if (!app) return textResult({ error: "app is required" }, true);
    const workspaceId = (args.workspace_id as string | undefined) || config.workspaceIds[0] || undefined;
    return textResult({
      app,
      workspace_id: workspaceId ?? null,
      status: "action_required",
      message: `Open connect_url to authorize ${app}, then call wait_for_connection or refresh_tools.`,
      connect_url: connectUrl(app, workspaceId, config),
    });
  }

  if (name === "disconnect_app") {
    const app = String(args.app ?? "");
    const dash = (process.env.MCPGRAM_APP_URL || config.baseUrl || "https://mcpgram.vercel.app").replace(/\/+$/, "");
    return textResult({ app, status: "manual", message: `Disconnect ${app} in the MCPGRAM dashboard.`, dashboard_url: `${dash}/dashboard` });
  }

  if (name === "wait_for_connection") {
    const app = String(args.app ?? "").toLowerCase();
    const timeout = Math.min(Math.max(Number(args.timeout_seconds ?? 90), 5), 300);
    const interval = Math.min(Math.max(Number(args.poll_interval_seconds ?? 3), 1), 15);
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      const catalog = await buildCatalog(registry, config);
      const hit = catalog.find(
        (t) =>
          t.app.toLowerCase().includes(app) ||
          t.serverName.toLowerCase().includes(app) ||
          t.publicId.toLowerCase().startsWith(app)
      );
      if (hit) return textResult({ connected: true, app: hit.app, server: hit.serverName, sample_tool: hit.publicId });
      await new Promise((r) => setTimeout(r, interval * 1000));
    }
    return textResult({ connected: false, app, error: `Timed out after ${timeout}s` }, true);
  }

  if (name === "discover_mcp") {
    const url = String(args.url ?? "").trim();
    const displayName = String(args.name ?? "external_mcp");
    if (!url.startsWith("http")) return textResult({ error: "url must be http(s)" }, true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      const json = (await res.json()) as {
        result?: { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> };
        error?: unknown;
      };
      if (!res.ok || json.error) return textResult({ error: "Failed tools/list", detail: json }, true);
      let added = 0;
      for (const tool of json.result?.tools ?? []) {
        const pid = publicId(displayName, tool.name);
        discovered.set(pid, {
          publicId: pid,
          mcpName: pid,
          toolId: pid,
          originalName: tool.name,
          serverName: displayName,
          description: tool.description?.trim() || tool.name,
          inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
          source: "discovered_mcp",
          app: appLabel(displayName),
        });
        added += 1;
      }
      return textResult({ ok: true, url, name: displayName, tools_discovered: added });
    } catch (err) {
      return textResult({ error: err instanceof Error ? err.message : String(err) }, true);
    }
  }

  return textResult({ error: `Unknown universal tool: ${name}` }, true);
}
