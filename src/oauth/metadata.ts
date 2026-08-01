import { publicBaseUrl, resourceUrl } from "./config.js";

/**
 * Authorization Server Metadata (RFC 8414).
 * MCPGRAM is the authorization server — no external IdP.
 */
export function authorizationServerMetadata(req?: Request) {
  const pub = publicBaseUrl(req);
  return {
    issuer: pub,
    authorization_endpoint: `${pub}/authorize`,
    token_endpoint: `${pub}/token`,
    registration_endpoint: `${pub}/register`,
    revocation_endpoint: `${pub}/revoke`,
    scopes_supported: ["mcp", "openid", "profile", "email", "offline_access"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    subject_types_supported: ["public"],
    service_documentation: `${pub}/`,
  };
}

/** RFC 9728 Protected Resource Metadata — points clients at this deployment as AS. */
export function protectedResourceMetadata(req?: Request) {
  const pub = publicBaseUrl(req);
  const resource = resourceUrl(req);

  return {
    resource,
    authorization_servers: [pub.endsWith("/") ? pub : `${pub}/`],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp", "openid", "profile", "email", "offline_access"],
    resource_documentation: `${pub}/`,
  };
}
