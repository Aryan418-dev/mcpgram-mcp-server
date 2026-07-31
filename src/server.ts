import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { McpgramApi } from "./api.js";
import { ToolRegistry } from "./tools.js";
import { executeToolCall } from "./execute.js";
import { logger } from "./logger.js";

export function createMcpServer(config: Config): Server {
  const api = new McpgramApi(config);
  const registry = new ToolRegistry(api);

  const server = new Server(
    {
      name: "mcpgram",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug("tools/list");
    try {
      const tools = await registry.listForMcp();
      return { tools };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("tools/list failed", { message });
      throw err;
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.debug("tools/call", { name });
    return executeToolCall(registry, api, name, args ?? {});
  });

  return server;
}
