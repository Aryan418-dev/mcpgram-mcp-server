#!/usr/bin/env node
/**
 * MCPGRAM MCP Server
 *
 * Translation layer: MCP clients (Claude, Cursor, …) ↔ MCPGRAM public API.
 * Speaks MCP over stdio; authenticates to MCPGRAM with a workspace API key.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createMcpServer } from "./server.js";
import { logger } from "./logger.js";

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[mcpgram-mcp] ${message}\n`);
    process.exit(1);
  }

  logger.setLevel(config.logLevel);
  logger.info("Starting MCPGRAM MCP server", {
    baseUrl: config.baseUrl,
  });

  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Connected over stdio \u2014 ready for MCP clients");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[mcpgram-mcp] Fatal: ${message}\n`);
  process.exit(1);
});
