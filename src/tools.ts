import type { McpgramApi } from "./api.js";
import { logger } from "./logger.js";
import type { ResolvedTool } from "./types.js";

/** Sanitize a string into a valid MCP tool name fragment. */
export function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "tool";
}

function uniqueName(
  serverName: string,
  toolName: string,
  used: Set<string>
): string {
  const base = `${sanitizeName(serverName)}__${sanitizeName(toolName)}`;
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
    return { type: "object", properties: {} };
  }
  if (!("type" in schema)) {
    return { type: "object", properties: {}, ...schema };
  }
  return schema;
}

/**
 * Fetch tools from MCPGRAM and map them to MCP Tool descriptors.
 * Maintains a name → tool_id registry for tools/call.
 */
export class ToolRegistry {
  private byName = new Map<string, ResolvedTool>();

  constructor(private readonly api: McpgramApi) {}

  get(mcpName: string): ResolvedTool | undefined {
    return this.byName.get(mcpName);
  }

  async refresh(): Promise<ResolvedTool[]> {
    const data = await this.api.listTools();
    const used = new Set<string>();
    const next = new Map<string, ResolvedTool>();

    for (const server of data.servers ?? []) {
      for (const tool of server.tools ?? []) {
        const mcpName = uniqueName(server.name, tool.name, used);
        const resolved: ResolvedTool = {
          mcpName,
          toolId: tool.tool_id,
          originalName: tool.name,
          serverName: server.name,
          description:
            tool.description?.trim() ||
            `${tool.name} via ${server.name}`,
          inputSchema: normalizeInputSchema(tool.input_schema),
        };
        next.set(mcpName, resolved);
      }
    }

    this.byName = next;
    logger.info(`Discovered ${next.size} tools from MCPGRAM`, {
      servers: (data.servers ?? []).map((s) => s.name),
    });
    return [...next.values()];
  }

  async listForMcp(): Promise<
    Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>
  > {
    const tools = await this.refresh();
    return tools.map((t) => ({
      name: t.mcpName,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }
}
