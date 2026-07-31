#!/usr/bin/env node
/**
 * MCPGRAM MCP Server — standalone Streamable HTTP listener.
 *
 * Each client request must send: Authorization: Bearer <MCPGRAM_API_KEY>
 *
 *   npm run dev:http
 *   → http://127.0.0.1:3100/mcp
 */

import { createServer } from "node:http";
import { handleMcpHttpRequest } from "./transport/http.js";
import { logger } from "./logger.js";

const port = Number(process.env.PORT ?? process.env.MCPGRAM_HTTP_PORT ?? 3100);

logger.setLevel(
  (process.env.MCPGRAM_LOG_LEVEL as "debug" | "info" | "warn" | "error") ??
    "info"
);

const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? `127.0.0.1:${port}`;
    const url = new URL(req.url ?? "/", `http://${host}`);

    if (url.pathname !== "/mcp" && url.pathname !== "/mcp/") {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Not found. MCP endpoint is POST /mcp" }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const bodyBuf = Buffer.concat(chunks);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((vv) => headers.append(k, vv));
      else headers.set(k, v);
    }

    const request = new Request(url, {
      method: req.method,
      headers,
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : bodyBuf.length
            ? bodyBuf
            : undefined,
      // @ts-expect-error Node fetch duplex
      duplex: "half",
    });

    const response = await handleMcpHttpRequest(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const ab = await response.arrayBuffer();
    res.end(Buffer.from(ab));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Node HTTP adapter error", { message });
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      })
    );
  }
});

server.listen(port, () => {
  logger.info(`MCP Streamable HTTP listening on http://127.0.0.1:${port}/mcp`);
  logger.info(`Health: http://127.0.0.1:${port}/mcp?health=1`);
});
