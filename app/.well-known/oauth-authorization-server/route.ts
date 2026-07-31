import { authorizationServerMetadata } from "../../../src/oauth/metadata";
import { auth0Issuer, isAuth0Configured } from "../../../src/oauth/auth0";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Cache-Control": "public, max-age=60",
  "Access-Control-Allow-Origin": "*",
};

/**
 * Prefer live Auth0 AS metadata when Auth0 is configured so Claude gets
 * registration_endpoint and exact endpoints from the real AS.
 */
export async function GET(req: Request) {
  if (isAuth0Configured()) {
    const base = auth0Issuer()!;
    try {
      const upstream = await fetch(`${base}/.well-known/oauth-authorization-server`, {
        next: { revalidate: 60 },
      });
      if (upstream.ok) {
        const json = await upstream.json();
        return Response.json(json, { headers: CORS });
      }
      // Fallback: OIDC discovery
      const oidc = await fetch(`${base}/.well-known/openid-configuration`, {
        next: { revalidate: 60 },
      });
      if (oidc.ok) {
        const json = await oidc.json();
        return Response.json(json, { headers: CORS });
      }
    } catch {
      // fall through to static metadata
    }
  }

  return Response.json(authorizationServerMetadata(req), { headers: CORS });
}
