import { publicBaseUrl, resourceUrl } from "./config.js";

export function authorizationServerMetadata(req?: Request) {
  const base = publicBaseUrl(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    revocation_endpoint: `${base}/revoke`,
    scopes_supported: ["mcp", "openid", "offline_access"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    // Claude / OAuth 2.1 expect refresh_token grant with offline_access
    subject_types_supported: ["public"],
    service_documentation: `${base}/`,
  };
}

export function protectedResourceMetadata(req?: Request) {
  const base = publicBaseUrl(req);
  const resource = resourceUrl(req);
  return {
    resource,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
    resource_documentation: `${base}/`,
  };
}
