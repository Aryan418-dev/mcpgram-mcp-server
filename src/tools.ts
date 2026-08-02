import type { Config } from "./config.js";
import { allApiKeys, configFromApiKey } from "./config.js";
import type { McpgramApi } from "./api.js";
import { McpgramApi as ApiCtor } from "./api.js";
import { logger } from "./logger.js";
import type { ResolvedTool } from "./types.js";

export function sanitizeName(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64) || "tool"
  );
}

function uniqueName(
  serverName: string,
  toolName: string,
  used: Set<string>,
  workspaceHint?: string
): string {
  const baseParts = [
    workspaceHint ? sanitizeName(workspaceHint) : null,
    sanitizeName(serverName),
    sanitizeName(toolName),
  ].filter(Boolean) as string[];
  const base = baseParts.join("__");
  let candidate = base.slice(0, 120);
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 110)}_${i++}`;
  }
  used.add(candidate);
  return candidate;
}

function normalizeInputSchema(
  schema: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {}, additionalProperties: true };
  }
  if (!schema.type) {
    return { type: "object", properties: schema.properties ?? {}, additionalProperties: true, ...schema };
  }
  return schema;
}

export class ToolRegistry {
  private byName = new Map<string, ResolvedTool>();

  constructor(
    private readonly api: McpgramApi,
    private readonly config: Config
  ) {}

  get(mcpName: string): ResolvedTool | undefined {
    return this.byName.get(mcpName);
  }

  /** All resolved connector tools (internal catalog). */
  all(): ResolvedTool[] {
    return [...this.byName.values()];
  }

  async refresh(): Promise<ResolvedTool[]> {
    const used = new Set<string>();
    const next = new Map<string, ResolvedTool>();
    const keys = allApiKeys(this.config);
    const multi = keys.length > 1;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const wsId = this.config.workspaceIds[i];
      const wsName =
        (wsId && this.config.workspaceNames[wsId]) || (multi ? `ws${i + 1}` : undefined);
      const api = key === this.config.apiKey ? this.api : new ApiCtor(configFromApiKey(key));

      try {
        const data = await api.listTools();
        for (const server of data.servers ?? []) {
          for (const tool of server.tools ?? []) {
            const mcpName = uniqueName(
              server.name,
              tool.name,
              used,
              multi ? wsName : undefined
            );
            next.set(mcpName, {
              mcpName,
              toolId: tool.tool_id,
              originalName: tool.name,
              serverName: server.name,
              description: tool.description?.trim() || `${tool.name} via ${server.name}`,
              inputSchema: normalizeInputSchema(tool.input_schema),
              apiKey: key,
              workspaceId: wsId,
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`Failed to list tools for workspace index ${i}`, { message });
      }
    }

    this.byName = next;
    logger.info(`Discovered ${next.size} connector tools from MCPGRAM`, {
      workspaces: keys.length,
    });
    return [...next.values()];
  }

  async listForMcp(): Promise<
    Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
  > {
    // Universal Layer: AI agents only see ~15 meta-tools.
    // Connector tools remain internal (search_tools / execute_tool).
    const { UNIVERSAL_TOOLS } = await import("./universal/defs.js");
    void this.refresh().catch(() => undefined);
    return UNIVERSAL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }
}
