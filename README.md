# mcpgram-mcp-server

Official MCP bridge for [MCPGRAM](https://mcpgram.vercel.app):

- **stdio** for local MCP clients
- **Streamable HTTP** at `/mcp` (Vercel)
- **Auth0** as OAuth authorization server for Claude.ai custom connectors
- **API key** auth still supported (`Bearer mcpg_live_…`)

## Architecture (Claude)

```
Claude.ai
   → GET /.well-known/oauth-protected-resource  (this server)
   → authorization_servers = Auth0 tenant
   → DCR + login + token  (Auth0)
   → POST /mcp  Authorization: Bearer <Auth0 JWT>
   → tools/list, tools/call → MCPGRAM API
```

This deployment is a **resource server**. It does **not** host Claude’s login when Auth0 is configured.

## Required env (Vercel)

| Variable | Purpose |
|----------|---------|
| `MCP_PUBLIC_URL` | Public URL of this app, e.g. `https://mcpgram-mcp-server.vercel.app` |
| `AUTH0_DOMAIN` | e.g. `your-tenant.us.auth0.com` |
| `AUTH0_AUDIENCE` | Auth0 API identifier, must match resource e.g. `https://mcpgram-mcp-server.vercel.app/mcp` |
| `MCPGRAM_OAUTH_API_KEY` | MCPGRAM workspace API key used after Auth0 login |
| `MCPGRAM_BASE_URL` | MCPGRAM backend (default `https://mcpgram.vercel.app`) |

## Claude.ai setup

1. Configure Auth0 (API, DCR, Resource Parameter profile) — see project checklist.
2. Set env vars above; redeploy.
3. Disable Vercel Deployment Protection for this project.
4. Claude → Settings → Connectors → Add custom connector:
   - URL: `https://mcpgram-mcp-server.vercel.app/mcp`
   - Leave Client ID / Secret empty (DCR via Auth0).
5. Complete Auth0 login in the browser.

## Local stdio

```bash
MCPGRAM_API_KEY=mcpg_live_… npx mcpgram-mcp-server
```

## Health

`GET /mcp?health=1` → `{ ok, auth0: true/false }`
