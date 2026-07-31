import { authorizationServerMetadata } from "../../../src/oauth/metadata";
import { auth0Issuer, isAuth0Configured } from "../../../src/oauth/auth0";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Cache-Control": "public, max-age=60",
  "Access-Control-Allow-Origin": "*",
};

export async function GET(req: Request) {
  if (isAuth0Configured()) {
    const base = auth0Issuer()!;
    try {
      const upstream = await fetch(`${base}/.well-known/openid-configuration`, {
        next: { revalidate: 60 },
      });
      if (upstream.ok) {
        return Response.json(await upstream.json(), { headers: CORS });
      }
    } catch {
      // fall through
    }
  }
  return Response.json(authorizationServerMetadata(req), { headers: CORS });
}
