import { publicBaseUrl, resourceUrl } from "./config.js";
import { auth0Issuer, auth0IssuerWithSlash, isAuth0Configured } from "./auth0.js";

/**
 * Authorization Server Metadata.
 * When Auth0 is configured, clients should use Auth0 — we still expose this
 * path for discovery probes; prefer proxying Auth0's document in the route.
 */
export function authorizationServerMetadata(req?: Request) {
  if (isAuth0Configured()) {
    const issuer = auth0IssuerWithSlash()!;
    const base = auth0Issuer()!;
    return {
      issuer,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oidc/register`,
      jwks_uri: `${base}/.well-known/jwks.json`,
      scopes_supported: ["openid", "profile", "email", "offline_access"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      code_challenge_methods_supported: ["S256"],
      subject_types_supported: ["public"],
    };
  }

  // Legacy: this deployment as AS (only if Auth0 not configured)
  const pub = publicBaseUrl(req);
  return {
    issuer: pub,
    authorization_endpoint: `${pub}/authorize`,
    token_endpoint: `${pub}/token`,
    registration_endpoint: `${pub}/register`,
    revocation_endpoint: `${pub}/revoke`,
    scopes_supported: ["mcp", "openid", "offline_access"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    subject_types_supported: ["public"],
    service_documentation: `${pub}/`,
  };
}

/** RFC 9728 Protected Resource Metadata — points Claude at Auth0. */
export function protectedResourceMetadata(req?: Request) {
  const pub = publicBaseUrl(req);
  const resource = resourceUrl(req);
  const as = isAuth0Configured() ? auth0IssuerWithSlash()! : pub;

  return {
    resource,
    authorization_servers: [as],
    bearer_methods_supported: ["header"],
    scopes_supported: isAuth0Configured()
      ? ["openid", "profile", "email", "offline_access"]
      : ["mcp"],
    resource_documentation: `${pub}/`,
  };
}
