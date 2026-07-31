# mcpgram-mcp-server

Official **Model Context Protocol (MCP)** server for [MCPGRAM](https://mcpgram.vercel.app).

| Transport | Use case |
|-----------|----------|
| **stdio** | Claude Desktop, Cursor local |
| **Streamable HTTP + OAuth 2.1** | Claude.ai custom connectors |

## Claude.ai custom connector (OAuth)

1. Deploy this repo to Vercel.
2. **Disable Vercel Deployment Protection** (Project → Settings → Deployment Protection → off). Claude must reach `/.well-known/*` without Vercel SSO.
3. Set environment variables (see below).
4. In Claude.ai → Settings → Connectors → **Add custom connector**
   - URL: `https://<your-deployment>.vercel.app/mcp`
   - Leave OAuth Client ID / Secret **empty** (Dynamic Client Registration is enabled).
5. Click **Connect** → sign in with Google / GitHub / email (Supabase Auth) → pick workspace → Allow.

### OAuth flow

```
Claude.ai
  → GET /.well-known/oauth-protected-resource
  → GET /.well-known/oauth-authorization-server
  → POST /register          (DCR)
  → GET  /authorize         (Supabase login + consent)
  → POST /token             (code + PKCE → access_token)
  → POST /mcp               Authorization: Bearer <access_token>
```

No Vercel Authentication is used.

## Environment variables

```bash
MCP_PUBLIC_URL=https://mcpgram-mcp-server.vercel.app
OAUTH_JWT_SECRET=<openssl rand -hex 32>
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # creates workspace API keys after consent
MCPGRAM_BASE_URL=https://mcpgram.vercel.app
```

Supabase redirect URLs to allow:
- `https://<mcp-server-host>/auth/callback`

## API key auth (still supported)

```http
Authorization: Bearer mcpg_live_YOUR_KEY
```

Works for Claude Code, Cursor headers, and local HTTP.

## Local stdio

```bash
export MCPGRAM_API_KEY=mcpg_live_...
npm run build:server && npm start
```

## License

MIT
