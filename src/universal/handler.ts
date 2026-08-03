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
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "app"
  );
}

function publicId(serverName: string, toolName: string): string {
  return `${slug(serverName)}.${slug(toolName)}`;
}

function appLabel(serverName: string): string {
  const s = serverName.trim();
  if (!s) return "Unknown";
  return s
    .replace(/\(native\)/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function isNativeName(serverName: string): boolean {
  return /\(native\)/i.test(serverName);
}

async function buildCatalog(
  registry: ToolRegistry,
  _config: Config
): Promise<CatalogEntry[]> {
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
  const hay =
    `${t.publicId} ${t.app} ${t.serverName} ${t.originalName} ${t.description} ${t.providerType}`.toLowerCase();
  if (!q) return 0;
  if (t.publicId.toLowerCase() === q) return 100;
  if (t.originalName.toLowerCase() === q) return 90;
  if (hay.includes(q)) return 70;
  const parts = q.split(/\s+/).filter(Boolean);
  let s = 0;
  for (const p of parts) if (hay.includes(p)) s += 15;
  return s;
}

async function runUpstream(
  entry: CatalogEntry,
  args: Record<string, unknown>,
  api: McpgramApi,
  config: Config
): Promise<McpToolResult> {
  if (entry.source === "discovered_mcp") {
    return textResult(
      {
        success: false,
        error:
          "This tool was only discovered in-session. Call connect_mcp_server to save it permanently, then execute_tool again.",
        tool_id: entry.publicId,
      },
      true
    );
  }

  const execApi =
    entry.apiKey && entry.apiKey !== config.apiKey
      ? new McpgramApi(configFromApiKey(entry.apiKey))
      : api;

  // Validate required input fields from schema before upstream call
  const schema = entry.inputSchema as {
    required?: string[];
    properties?: Record<string, unknown>;
  };
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const missing = required.filter((k) => {
    const v = args[k];
    return v === undefined || v === null || v === "";
  });
  if (missing.length > 0) {
    return textResult(
      {
        success: false,
        error: `Missing required argument(s): ${missing.join(", ")}`,
        missing,
        tool_id: entry.publicId,
        status: 400,
      },
      true
    );
  }

  try {
    const result = await execApi.execute({
      tool_id: entry.toolId,
      input: args,
    });
    if (result.status === "error" || result.error) {
      return textResult(
        {
          success: false,
          error: result.error ?? "Tool execution failed",
          tool_id: entry.publicId,
          provider: entry.app,
          provider_type: entry.providerType,
        },
        true
      );
    }
    return textResult({
      success: true,
      tool_id: entry.publicId,
      app: entry.app,
      provider: entry.app,
      provider_type: entry.providerType,
      result: result.output,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return textResult(
        {
          success: false,
          error: `MCPGRAM API (${err.status}): ${err.message}`,
          tool_id: entry.publicId,
        },
        true
      );
    }
    return textResult(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        tool_id: entry.publicId,
      },
      true
    );
  }
}

function connectUrl(app: string, workspaceId: string | undefined, config: Config): string {
  const dash = (process.env.MCPGRAM_APP_URL || config.baseUrl || "https://mcpgram.vercel.app").replace(
    /\/+$/,
    ""
  );
  const provider = slug(app).replace(/_/g, "");
  if (workspaceId) {
    return `${dash}/api/oauth/${provider}/authorize?workspace_id=${encodeURIComponent(workspaceId)}`;
  }
  return `${dash}/dashboard?connect=${encodeURIComponent(provider)}`;
}

function normalizeAuth(
  auth: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!auth || typeof auth !== "object") return undefined;
  const type = String(auth.type ?? "none").toLowerCase();
  const out: Record<string, unknown> = { type };
  if (auth.token) out.token = auth.token;
  if (auth.api_key) out.api_key = auth.api_key;
  if (auth.username) out.username = auth.username;
  if (auth.password) out.password = auth.password;
  return out;
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
        discovered_session: [...discovered.keys()],
      });
    }

    case "search_tools": {
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
        tool_id: t.toolId,
        app: t.app,
        name: t.originalName,
        description: t.description,
        provider: t.app,
        provider_type: t.providerType,
        workspace_id: t.workspaceId ?? null,
        score,
      }));
      return textResult({ query, count: results.length, results });
    }

    case "get_tool":
    case "get_tool_schema":
    case "explain_tool": {
      const toolId = String(args.tool_id ?? "");
      const catalog = await buildCatalog(registry, config);
      const t = findTool(catalog, toolId);
      if (!t) return textResult({ error: `Unknown tool_id: ${toolId}` }, true);
      if (name === "get_tool_schema") {
        return textResult({ tool_id: t.publicId, input_schema: t.inputSchema });
      }
      if (name === "explain_tool") {
        return textResult({
          tool_id: t.publicId,
          app: t.app,
          provider_type: t.providerType,
          summary: t.description,
          how_to_call: {
            tool: "execute_tool",
            arguments: { tool_id: t.publicId, arguments: {} },
          },
          input_schema: t.inputSchema,
        });
      }
      return textResult({
        id: t.publicId,
        tool_id: t.toolId,
        app: t.app,
        name: t.originalName,
        description: t.description,
        provider: t.app,
        provider_type: t.providerType,
        authentication: "Credentials stored securely in MCPGRAM; never exposed to the model",
        workspace_id: t.workspaceId ?? null,
        source: t.source,
        input_schema: t.inputSchema,
      });
    }

    case "execute_tool": {
      const toolId = String(args.tool_id ?? "").trim();
      const serverId = args.server_id ? String(args.server_id).trim() : "";
      const toolName = args.tool_name ? String(args.tool_name).trim() : "";
      const callArgs =
        args.arguments && typeof args.arguments === "object" && !Array.isArray(args.arguments)
          ? (args.arguments as Record<string, unknown>)
          : {};

      const catalog = await buildCatalog(registry, config);

      let t: CatalogEntry | undefined;
      if (toolId) {
        t = findTool(catalog, toolId);
      } else if (serverId && toolName) {
        const sid = serverId.toLowerCase();
        const tn = toolName.toLowerCase();
        // Prefer exact serverId match (mcp_servers.id) + tool name
        t = catalog.find(
          (c) =>
            c.originalName.toLowerCase() === tn &&
            (c as CatalogEntry & { serverId?: string }).serverId?.toLowerCase() === sid
        );
        if (!t) {
          t = catalog.find(
            (c) =>
              c.originalName.toLowerCase() === tn &&
              (c.serverName.toLowerCase().includes(sid) ||
                c.publicId.toLowerCase().startsWith(slug(serverId)) ||
                c.mcpName.toLowerCase().includes(sid))
          );
        }
        // If still missing, try tool name alone when unique
        if (!t) {
          const byName = catalog.filter((c) => c.originalName.toLowerCase() === tn);
          if (byName.length === 1) t = byName[0];
        }
      }

      if (!t) {
        return textResult(
          {
            success: false,
            error: toolId
              ? `Unknown tool_id: ${toolId}. Use search_tools first.`
              : "Provide tool_id, or server_id + tool_name. Use search_tools / list_connected_servers.",
          },
          true
        );
      }
      return runUpstream(t, callArgs, api, config);
    }

    case "execute_batch": {
      const calls = Array.isArray(args.calls) ? args.calls : [];
      if (calls.length === 0) return textResult({ error: "calls must be a non-empty array" }, true);
      if (calls.length > 20) return textResult({ error: "max 20 calls per batch" }, true);
      const catalog = await buildCatalog(registry, config);
      const results = await Promise.all(
        calls.map(async (c, i) => {
          const item = c as { tool_id?: string; arguments?: Record<string, unknown> };
          const id = String(item.tool_id ?? "");
          const t = findTool(catalog, id);
          if (!t) return { index: i, tool_id: id, success: false, error: "unknown tool" };
          const r = await runUpstream(t, item.arguments ?? {}, api, config);
          const body = r.content?.[0]?.text;
          let parsed: unknown = body;
          try {
            parsed = body ? JSON.parse(body) : null;
          } catch {
            /* keep text */
          }
          return { index: i, tool_id: id, result: parsed, isError: r.isError === true };
        })
      );
      return textResult({ count: results.length, results });
    }

    case "execute_workflow": {
      const steps = Array.isArray(args.steps) ? args.steps : [];
      const continueOnError = Boolean(args.continue_on_error);
      if (steps.length === 0) return textResult({ error: "steps must be a non-empty array" }, true);
      if (steps.length > 15) return textResult({ error: "max 15 workflow steps" }, true);
      const catalog = await buildCatalog(registry, config);
      const history: unknown[] = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i] as {
          tool_id?: string;
          arguments?: Record<string, unknown>;
          name?: string;
        };
        const id = String(step.tool_id ?? "");
        const t = findTool(catalog, id);
        if (!t) {
          const err = { step: i, tool_id: id, success: false, error: "unknown tool" };
          history.push(err);
          if (!continueOnError) return textResult({ stopped_at: i, history }, true);
          continue;
        }
        const r = await runUpstream(t, step.arguments ?? {}, api, config);
        let parsed: unknown = r.content?.[0]?.text;
        try {
          parsed = parsed ? JSON.parse(String(parsed)) : null;
        } catch {
          /* keep */
        }
        history.push({
          step: i,
          name: step.name,
          tool_id: id,
          result: parsed,
          isError: r.isError === true,
        });
        if (r.isError && !continueOnError) {
          return textResult({ stopped_at: i, history }, true);
        }
      }
      return textResult({ success: true, steps: history.length, history });
    }

    case "list_apps":
    case "list_connections": {
      const catalog = await buildCatalog(registry, config);
      const wsFilter = args.workspace_id ? String(args.workspace_id) : "";
      const byApp = new Map<
        string,
        {
          app: string;
          server: string;
          tool_count: number;
          workspace_ids: Set<string>;
          status: string;
          provider_type: ProviderType;
        }
      >();
      for (const t of catalog) {
        if (wsFilter && t.workspaceId && t.workspaceId !== wsFilter) continue;
        const key = t.serverName.toLowerCase();
        let row = byApp.get(key);
        if (!row) {
          row = {
            app: t.app,
            server: t.serverName,
            tool_count: 0,
            workspace_ids: new Set(),
            status: "connected",
            provider_type: t.providerType,
          };
          byApp.set(key, row);
        }
        row.tool_count += 1;
        if (t.workspaceId) row.workspace_ids.add(t.workspaceId);
      }
      const connections = [...byApp.values()].map((r) => ({
        app: r.app,
        server: r.server,
        status: r.status,
        tool_count: r.tool_count,
        provider_type: r.provider_type,
        workspace_ids: [...r.workspace_ids],
        connection_id: slug(r.server),
      }));
      if (name === "list_apps") {
        return textResult({
          apps: connections.map((c) => ({
            name: c.app,
            server: c.server,
            tool_count: c.tool_count,
            status: c.status,
            provider_type: c.provider_type,
          })),
        });
      }
      return textResult({ connections });
    }

    case "list_connected_servers": {
      try {
        const data = await api.listMcpServers();
        const catalog = await buildCatalog(registry, config);
        const byServer = new Map<string, number>();
        for (const t of catalog) {
          const k = t.serverName.toLowerCase();
          byServer.set(k, (byServer.get(k) ?? 0) + 1);
        }
        const servers = (data.servers ?? []).map((s) => {
          const tool_count = s.tool_count ?? byServer.get(s.name.toLowerCase()) ?? 0;
          const live_status =
            s.live_status ??
            (s.status === "verified" && !s.last_error
              ? "connected"
              : s.status === "failed"
                ? "error"
                : "unknown");
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
        });
      } catch (err) {
        const catalog = await buildCatalog(registry, config);
        const byName = new Map<
          string,
          { name: string; tool_count: number; provider_type: ProviderType; workspace_id?: string }
        >();
        for (const t of catalog) {
          const k = t.serverName;
          let row = byName.get(k);
          if (!row) {
            row = {
              name: t.serverName,
              tool_count: 0,
              provider_type: t.providerType,
              workspace_id: t.workspaceId,
            };
            byName.set(k, row);
          }
          row.tool_count += 1;
        }
        const servers = [...byName.values()].map((s) => ({
          server_id: slug(s.name),
          name: s.name,
          url: null,
          status: "connected",
          tool_count: s.tool_count,
          provider_type: s.provider_type,
          workspace_id: s.workspace_id ?? null,
        }));
        return textResult({
          workspace_id: config.workspaceIds[0] ?? null,
          count: servers.length,
          servers,
          note:
            err instanceof Error
              ? `API list failed (${err.message}); derived from catalog`
              : "derived from catalog",
        });
      }
    }

    case "connect_mcp_server":
    case "discover_mcp": {
      const url = String(args.url ?? "").trim();
      const displayName = args.name ? String(args.name).trim() : undefined;
      if (!url) return textResult({ error: "url is required" }, true);
      if (!/^https?:\/\//i.test(url)) {
        return textResult({ error: "url must be a valid http(s) URL" }, true);
      }

      const authentication = normalizeAuth(
        args.authentication && typeof args.authentication === "object"
          ? (args.authentication as Record<string, unknown>)
          : undefined
      );

      try {
        const result = await api.connectMcpServer({
          url,
          name: displayName,
          authentication,
        });

        const tools = Array.isArray((result as { tools?: unknown }).tools)
          ? ((
              result as {
                tools: Array<{ id?: string; name: string; description?: string | null }>;
              }
            ).tools)
          : [];
        const serverName = String(
          (result as { name?: string }).name ?? displayName ?? new URL(url).hostname
        );
        for (const tool of tools) {
          const pid = tool.id || publicId(serverName, tool.name);
          discovered.set(pid, {
            publicId: pid,
            mcpName: pid,
            toolId: pid,
            originalName: tool.name,
            serverName,
            description: tool.description?.trim() || tool.name,
            inputSchema: { type: "object", properties: {}, additionalProperties: true },
            source: "discovered_mcp",
            app: appLabel(serverName),
            providerType: "external_mcp",
          });
        }

        void registry.refresh().catch(() => undefined);

        const toolCount = Number((result as { tool_count?: number }).tool_count ?? tools.length);
        const status = String((result as { status?: string }).status ?? "unknown");
        const ok =
          status === "verified" || Boolean((result as { connection_ok?: boolean }).connection_ok);

        return textResult({
          ok,
          server_id: (result as { server_id?: string }).server_id ?? null,
          name: serverName,
          url,
          status,
          tool_count: toolCount,
          tools: tools.map((t) => ({
            id: t.id ?? publicId(serverName, t.name),
            name: t.name,
            description: t.description ?? null,
            provider: serverName,
            provider_type: "external_mcp",
          })),
          needs_oauth: Boolean((result as { needs_oauth?: boolean }).needs_oauth),
          message:
            (result as { message?: string }).message ??
            (ok
              ? `${serverName} connected successfully. ${toolCount} tools discovered.`
              : `Saved with status ${status}`),
          next_steps: ok
            ? ["Use search_tools to find tools", "Use execute_tool with the returned id"]
            : ["Check URL and authentication", "Call refresh_server after fixing credentials"],
        });
      } catch (err) {
        if (err instanceof ApiError) {
          return textResult(
            {
              success: false,
              error: `Failed to connect MCP server (${err.status}): ${err.message}`,
              url,
            },
            true
          );
        }
        return textResult(
          { success: false, error: err instanceof Error ? err.message : String(err), url },
          true
        );
      }
    }

    case "disconnect_mcp_server": {
      const serverId = String(args.server_id ?? "").trim();
      if (!serverId) return textResult({ error: "server_id is required" }, true);
      try {
        const result = await api.disconnectMcpServer(serverId);
        for (const [k, v] of discovered.entries()) {
          if (v.serverName === serverId || k.includes(serverId) || v.toolId === serverId) {
            discovered.delete(k);
          }
        }
        void registry.refresh().catch(() => undefined);
        return textResult({
          ok: true,
          server_id: serverId,
          message:
            (result as { message?: string }).message ??
            "Disconnected. Tokens and tool cache removed.",
          ...result,
        });
      } catch (err) {
        if (err instanceof ApiError) {
          return textResult(
            { success: false, error: `Disconnect failed (${err.status}): ${err.message}` },
            true
          );
        }
        return textResult(
          { success: false, error: err instanceof Error ? err.message : String(err) },
          true
        );
      }
    }

    case "refresh_server":
    case "discover_tools": {
      const serverId = String(args.server_id ?? "").trim();
      if (!serverId) return textResult({ error: "server_id is required" }, true);
      try {
        const result = await api.refreshMcpServer(serverId);
        void registry.refresh().catch(() => undefined);
        const tools = Array.isArray((result as { tools?: unknown }).tools)
          ? (result as { tools: Array<{ name: string; description?: string }> }).tools
          : [];
        const r = result as Record<string, unknown>;
        const ok = Boolean(r.connection_ok ?? r.ok ?? true);
        return textResult({
          ok,
          server_id: serverId,
          status: (r.status as string) ?? null,
          tool_count: Number(r.tool_count ?? tools.length),
          tools: ok ? tools : undefined,
          message: (r.message as string) ?? (ok ? `Refreshed ${tools.length} tools` : `Refresh failed`),
          action: name,
          live_status: r.live_status ?? (ok ? "connected" : "error"),
          verification_status: r.verification_status ?? r.status ?? null,
          health: r.health ?? null,
          cached_tool_count: r.cached_tool_count ?? r.tool_count ?? tools.length,
          live_tool_count: r.live_tool_count ?? (ok ? tools.length : 0),
          using_cached_data: Boolean(r.using_cached_data),
          last_error: r.last_error ?? r.connection_error ?? null,
          last_error_code: r.last_error_code ?? null,
          authentication_status: r.authentication_status ?? null,
          last_health_check: r.last_health_check ?? null,
        });
      } catch (err) {
        if (err instanceof ApiError) {
          return textResult(
            { success: false, error: `Refresh failed (${err.status}): ${err.message}` },
            true
          );
        }
        return textResult(
          { success: false, error: err instanceof Error ? err.message : String(err) },
          true
        );
      }
    }

    case "connect_app": {
      const app = String(args.app ?? "");
      const workspaceId =
        (args.workspace_id as string | undefined) || config.workspaceIds[0] || undefined;
      if (!app) return textResult({ error: "app is required" }, true);
      const url = connectUrl(app, workspaceId, config);
      return textResult({
        app,
        workspace_id: workspaceId ?? null,
        status: "action_required",
        message: `Open this URL to connect ${app}. After authorizing, call wait_for_connection or refresh_tools.`,
        connect_url: url,
      });
    }

    case "disconnect_app": {
      const app = String(args.app ?? "");
      const dash = (process.env.MCPGRAM_APP_URL || config.baseUrl || "https://mcpgram.vercel.app").replace(
        /\/+$/,
        ""
      );
      return textResult({
        app,
        status: "manual",
        message: `Disconnect ${app} from the MCPGRAM dashboard (workspace connectors).`,
        dashboard_url: `${dash}/dashboard`,
      });
    }

    case "wait_for_connection": {
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
        if (hit) {
          return textResult({
            connected: true,
            app: hit.app,
            server: hit.serverName,
            provider_type: hit.providerType,
            sample_tool: hit.publicId,
          });
        }
        await new Promise((r) => setTimeout(r, interval * 1000));
      }
      return textResult(
        { connected: false, app, error: `Timed out after ${timeout}s waiting for ${app}` },
        true
      );
    }

    case "search_everything": {
      const query = String(args.query ?? "");
      const limit = Math.min(Math.max(Number(args.limit ?? 25), 1), 50);
      const catalog = await buildCatalog(registry, config);
      const tools = catalog
        .map((t) => ({ t, score: scoreMatch(t, query) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ t, score }) => ({
          type: "tool",
          id: t.publicId,
          app: t.app,
          provider_type: t.providerType,
          description: t.description,
          score,
        }));
      const appHits = new Map<string, { type: string; name: string; provider_type: ProviderType }>();
      for (const t of catalog) {
        const key = t.app.toLowerCase();
        if (query && !t.app.toLowerCase().includes(query.toLowerCase()) && scoreMatch(t, query) <= 0) {
          continue;
        }
        if (!query || t.app.toLowerCase().includes(query.toLowerCase()) || scoreMatch(t, query) > 0) {
          appHits.set(key, { type: "app", name: t.app, provider_type: t.providerType });
        }
      }
      // Always include apps of matched tools
      for (const tool of tools) {
        const src = catalog.find((c) => c.publicId === tool.id);
        if (src) appHits.set(src.app.toLowerCase(), { type: "app", name: src.app, provider_type: src.providerType });
      }
      const apps = [...appHits.values()];
      return textResult({ query, apps, tools });
    }

    case "mcpgram_health": {
      const catalog = await buildCatalog(registry, config);
      return textResult({
        ok: true,
        layer: "universal",
        version: "2.0.0",
        universal_tools: true,
        connector_tools_exposed_to_model: false,
        catalog_size: catalog.length,
        native_tools: catalog.filter((t) => t.providerType === "native").length,
        external_mcp_tools: catalog.filter((t) => t.providerType === "external_mcp").length,
        workspaces: config.workspaceIds.length,
        workspace_ids: config.workspaceIds,
        apps: [...new Set(catalog.map((t) => t.app))],
      });
    }

    case "mcpgram_workspace_info": {
      return textResult({
        workspace_ids: config.workspaceIds,
        workspace_names: config.workspaceNames,
        api_keys: allApiKeys(config).length,
      });
    }

    default:
      return textResult({ error: `Unknown universal tool: ${name}` }, true);
  }
}
