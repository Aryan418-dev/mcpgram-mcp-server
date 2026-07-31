/**
 * Vercel / Next.js App Router — Streamable HTTP MCP endpoint.
 *
 * URL: https://<deployment>/api/mcp  (and /mcp via rewrite)
 * Auth: Authorization: Bearer <MCPGRAM_API_KEY>
 */
import { handleMcpHttpRequest } from "../../../src/transport/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: Request): Promise<Response> {
  return handleMcpHttpRequest(req);
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
