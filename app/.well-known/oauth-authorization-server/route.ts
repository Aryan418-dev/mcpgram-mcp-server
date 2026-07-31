import { authorizationServerMetadata } from "../../../src/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json(authorizationServerMetadata(req), {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
