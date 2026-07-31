import { authorizationServerMetadata } from "../../../src/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Claude falls back to OIDC discovery when AS metadata path fails. */
export async function GET(req: Request) {
  return Response.json(authorizationServerMetadata(req), {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
