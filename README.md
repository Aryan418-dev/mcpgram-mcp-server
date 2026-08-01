# mcpgram-mcp-server

Official MCP server for MCPGRAM — **stdio + Streamable HTTP + built-in OAuth 2.1** for Claude.ai, Cursor, and other MCP clients.

## Features

- **MCPGRAM as Authorization Server** — DCR, PKCE, authorize, token, revoke
- **Per-user workspaces** — consent selects a workspace; tokens bind to that workspace API key
- No external Auth0 / WorkOS / Clerk dependency for MCP OAuth

## Flow

```
Claude → discovery (PRM + AS metadata on this host)
      → POST /register (DCR)
      → GET /authorize (login + workspace + consent)
      → POST /token (code + PKCE)
      → POST /mcp (Bearer access token)
      → workspace tools
```

## Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `MCP_PUBLIC_URL` | yes | Public origin of this deployment |
| `OAUTH_JWT_SECRET` | yes | HMAC for clients/codes/tokens (≥16 chars) |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Consent login + key issuance |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Browser consent session |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Issue workspace API keys server-side |
| `MCPGRAM_KEY_SECRET` | recommended | Encrypt stored workspace keys |
| `MCPGRAM_BASE_URL` | yes | MCPGRAM API (`https://mcpgram.vercel.app`) |

## Claude connector URL

```
https://mcpgram-mcp-server.vercel.app/mcp
```

Claude will discover OAuth on this same origin (`/register`, `/authorize`, `/token`).

## Isolation

Each user’s OAuth token only carries their selected workspace API key. User A never loads User B’s tools.
