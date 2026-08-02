import { z } from "zod";
import type { Config } from "./config.js";
import { configFromApiKey } from "./config.js";
import type { McpgramApi } from "./api.js";
import { ApiError, McpgramApi as ApiCtor } from "./api.js";
import type { ToolRegistry } from "./tools.js";
import { logger } from "./logger.js";
import { executePlatformTool, isPlatformTool } from "./platform-tools.js";
import { isUniversalTool } from "./universal/defs.js";
import { executeUniversalTool } from "./universal/handler.js";

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
  const parsed = CallArgsSchema.safeParse(args ?? {});
  const callArgs = (parsed.success ? parsed.data : {}) as Record<string, unknown>;

  if (isUniversalTool(name)) {
    return executeUniversalTool(registry, api, config, name, callArgs);
  }

  if (isPlatformTool(name)) {
    return executePlatformTool(config, name, callArgs);
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
          text: `Unknown tool: ${name}. Use search_tools to find tools, then execute_tool with the returned id.`,
        },
      ],
      isError: true,
    };
  }

  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }],
      isError: true,
    };
  }

  logger.info(`Executing connector tool (legacy direct)`, {
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
      input: callArgs,
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
