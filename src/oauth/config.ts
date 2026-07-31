/** Public origin of this MCP deployment (no trailing slash). */
export function publicBaseUrl(req?: Request): string {
  const env = process.env.MCP_PUBLIC_URL?.replace(/\/+$/, "");
  if (env) return env;
  if (req) {
    const u = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

export const MCP_RESOURCE_PATH = "/mcp";

export function resourceUrl(req?: Request): string {
  return `${publicBaseUrl(req)}${MCP_RESOURCE_PATH}`;
}

export const CLAUDE_REDIRECT_URIS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];
