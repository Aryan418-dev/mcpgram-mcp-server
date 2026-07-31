import { protectedResourceMetadata } from "../../../../src/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Path-aware PRM for resource https://host/mcp (RFC 9728). */
export async function GET(req: Request) {
  return Response.json(protectedResourceMetadata(req), {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
