import { publicBaseUrl, resourceUrl } from "./config.js";

/** Canonical product logo (dashboard public asset — high-res brand mark). */
const BRAND_LOGO = "https://mcpgram.vercel.app/White-logo.png";

/** Official public branding assets (absolute HTTPS). */
export function branding(req?: Request) {
  const pub = publicBaseUrl(req);
  const icon512 = `${pub}/icon-512.png`;
  return {
    name: "MCPGRAM",
    client_name: "MCPGRAM",
    // Prefer full brand mark so Claude / Gemini / ChatGPT connector cards show the real logo
    logo_uri: BRAND_LOGO,
    icon_uri: BRAND_LOGO,
    icons: [
      { src: `${pub}/favicon-32.png`, sizes: "32x32", type: "image/png" },
      { src: `${pub}/favicon.png`, sizes: "64x64", type: "image/png" },
      { src: `${pub}/favicon-128.png`, sizes: "128x128", type: "image/png" },
      { src: icon512, sizes: "512x512", type: "image/png" },
      { src: BRAND_LOGO, sizes: "1024x1024", type: "image/png" },
      { src: "https://mcpgram.vercel.app/Dark-logo.png", sizes: "1024x1024", type: "image/png" },
    ],
  };
}

/**
 * Authorization Server Metadata (RFC 8414).
 * MCPGRAM is the authorization server — no external IdP.
 */
export function authorizationServerMetadata(req?: Request) {
  const pub = publicBaseUrl(req);
  const brand = branding(req);
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
    op_policy_uri: `${pub}/`,
    op_tos_uri: `${pub}/`,
    logo_uri: brand.logo_uri,
    client_name: brand.name,
  };
}

/** RFC 9728 Protected Resource Metadata — points clients at this deployment as AS. */
export function protectedResourceMetadata(req?: Request) {
  const pub = publicBaseUrl(req);
  const resource = resourceUrl(req);
  const brand = branding(req);

  return {
    resource,
    authorization_servers: [pub.endsWith("/") ? pub : `${pub}/`],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp", "openid", "profile", "email", "offline_access"],
    resource_documentation: `${pub}/`,
    resource_name: brand.name,
    logo_uri: brand.logo_uri,
    icons: brand.icons,
  };
}
