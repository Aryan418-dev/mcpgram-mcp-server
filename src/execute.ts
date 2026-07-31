import { z } from "zod";
import type { McpgramApi } from "./api.js";
import { ApiError } from "./api.js";
import type { ToolRegistry } from "./tools.js";
import { logger } from "./logger.js";

const CallArgsSchema = z.record(z.unknown()).default({});

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Resolve an MCP tools/call into a MCPGRAM execute request and format the result.
 */
export async function executeToolCall(
  registry: ToolRegistry,
  api: McpgramApi,
  name: string,
  args: unknown
): Promise<McpToolResult> {
  let tool = registry.get(name);
  if (!tool) {
    await registry.refresh();
    tool = registry.get(name);
  }

  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const parsed = CallArgsSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      content: [
        {
          type: "text",
          text: `Invalid arguments: ${parsed.error.message}`,
        },
      ],
      isError: true,
    };
  }

  logger.info(`Executing tool`, {
    mcpName: name,
    toolId: tool.toolId,
    server: tool.serverName,
  });

  try {
    const result = await api.execute({
      tool_id: tool.toolId,
      input: parsed.data,
    });

    if (result.status === "error" || result.error) {
      return {
        content: [
          {
            type: "text",
            text: result.error ?? "Tool execution failed",
          },
        ],
        isError: true,
      };
    }

    const text = formatOutput(result.output);
    return {
      content: [{ type: "text", text }],
    };
  } catch (err) {
    if (err instanceof ApiError) {
      logger.error(`API error on execute`, {
        status: err.status,
        message: err.message,
      });
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
    logger.error(`Unexpected execute error`, { message });
    return {
      content: [{ type: "text", text: `Execution failed: ${message}` }],
      isError: true,
    };
  }
}

function formatOutput(output: unknown): string {
  if (output === null || output === undefined) {
    return "(empty result)";
  }
  if (typeof output === "string") {
    return output;
  }
  if (
    typeof output === "object" &&
    output !== null &&
    "content" in output &&
    Array.isArray((output as { content: unknown }).content)
  ) {
    const parts = (output as { content: Array<{ type?: string; text?: string }> })
      .content;
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
