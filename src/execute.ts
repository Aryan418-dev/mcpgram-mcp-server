import { z } from "zod";
import type { Config } from "./config.js";
import { configFromApiKey } from "./config.js";
import type { McpgramApi } from "./api.js";
import { ApiError, McpgramApi as ApiCtor } from "./api.js";
import type { ToolRegistry } from "./tools.js";
import { logger } from "./logger.js";
import { executePlatformTool, isPlatformTool } from "./platform-tools.js";

const CallArgsSchema = z.record(z.unknown()).default({});

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export async function executeToolCall(
  registry: ToolRegistry,
  api: McpgramApi,
  config: Config,
  name: string,
  args: unknown
): Promise<McpToolResult> {
  if (isPlatformTool(name)) {
    const parsed = CallArgsSchema.safeParse(args ?? {});
    return executePlatformTool(
      config,
      name,
      (parsed.success ? parsed.data : {}) as Record<string, unknown>
    );
  }

  let tool = registry.get(name);
  if (!tool) {
    await registry.refresh();
    tool = registry.get(name);
  }

  if (!tool) {
    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}. Try mcpgram_list_workspace_tools or mcpgram_how_to_add_tools.`,
        },
      ],
      isError: true,
    };
  }

  const parsed = CallArgsSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }],
      isError: true,
    };
  }

  logger.info(`Executing tool`, {
    mcpName: name,
    toolId: tool.toolId,
    server: tool.serverName,
    workspaceId: tool.workspaceId,
  });

  const execApi =
    tool.apiKey && tool.apiKey !== config.apiKey
      ? new ApiCtor(configFromApiKey(tool.apiKey))
      : api;

  try {
    const result = await execApi.execute({
      tool_id: tool.toolId,
      input: parsed.data,
    });

    if (result.status === "error" || result.error) {
      return {
        content: [{ type: "text", text: result.error ?? "Tool execution failed" }],
        isError: true,
      };
    }

    return { content: [{ type: "text", text: formatOutput(result.output) }] };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        content: [
          {
            type: "text",
            text: `MCPGRAM API error (${err.status}): ${err.message}`,
          },
        ],
        isError: true,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Execution failed: ${message}` }],
      isError: true,
    };
  }
}

function formatOutput(output: unknown): string {
  if (output === null || output === undefined) return "(empty result)";
  if (typeof output === "string") return output;
  if (
    typeof output === "object" &&
    output !== null &&
    "content" in output &&
    Array.isArray((output as { content: unknown }).content)
  ) {
    const parts = (output as { content: Array<{ type?: string; text?: string }> }).content;
    const texts = parts
      .map((p) => (typeof p?.text === "string" ? p.text : JSON.stringify(p)))
      .filter(Boolean);
    if (texts.length > 0) return texts.join("\n");
  }
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}
