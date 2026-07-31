import { publicBaseUrl, resourceUrl } from "./config.js";

export function authorizationServerMetadata(req?: Request) {
  const base = publicBaseUrl(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    revocation_endpoint: `${base}/revoke`,
    scopes_supported: ["mcp", "openid"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${base}/`,
  };
}

export function protectedResourceMetadata(req?: Request) {
  const base = publicBaseUrl(req);
  return {
    resource: resourceUrl(req),
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  };
}
