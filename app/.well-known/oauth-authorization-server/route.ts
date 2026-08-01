import { authorizationServerMetadata } from "../../../src/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Cache-Control": "public, max-age=60",
  "Access-Control-Allow-Origin": "*",
};

/** RFC 8414 — MCPGRAM is the authorization server. */
export async function GET(req: Request) {
  return Response.json(authorizationServerMetadata(req), { headers: CORS });
}
