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
  const registry = new ToolRegistry(api, config);

  const server = new Server(
    {
      name: "MCPGRAM",
      version: "2.0.0",
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
    const tools = await registry.listForMcp();
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.debug("tools/call", { name });
    return executeToolCall(registry, api, config, name, args ?? {});
  });

  return server;
}

export { McpgramApi, ToolRegistry };
