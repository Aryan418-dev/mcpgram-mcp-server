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

/** Shared MCP Server factory used by stdio and HTTP transports. */
export function createMcpServer(config: Config): Server {
  const api = new McpgramApi(config);
  const registry = new ToolRegistry(api);

  const server = new Server(
    {
      name: "mcpgram",
      version: "1.1.0",
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
    return executeToolCall(registry, api, name, args ?? {});
  });

  return server;
}

export { McpgramApi, ToolRegistry };
