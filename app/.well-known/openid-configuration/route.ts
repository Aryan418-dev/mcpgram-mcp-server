import { authorizationServerMetadata } from "../../../src/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Cache-Control": "public, max-age=60",
  "Access-Control-Allow-Origin": "*",
};

/** OIDC discovery fallback — same endpoints as RFC 8414 metadata. */
export async function GET(req: Request) {
  const meta = authorizationServerMetadata(req);
  return Response.json(
    {
      ...meta,
      // OIDC clients often expect these keys
      userinfo_endpoint: `${meta.issuer}/userinfo`,
      jwks_uri: `${meta.issuer}/.well-known/jwks.json`,
    },
    { headers: CORS }
  );
}
