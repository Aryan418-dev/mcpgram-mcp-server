# mcpgram-mcp-server

Official MCP bridge for MCPGRAM:

- **stdio** + **Streamable HTTP** (`/mcp`)
- **Auth0** authorization server for Claude.ai
- **Per-user workspaces** — each Auth0 login maps to that user’s MCPGRAM workspace API key (no shared global key)

## Auth flow (Claude)

```
Claude → Auth0 login
      → Bearer JWT on /mcp
      → verify JWT (JWKS)
      → email/sub → auth_identities → Supabase user
      → active / default workspace
      → oauth_workspace_keys (encrypted) or create api_keys row
      → GET /api/v1/tools + POST /api/v1/execute as that workspace only
```

## Database (one-time)

Run in Supabase SQL editor:

`supabase/migrations/20260801_auth0_identities.sql`

Creates `auth_identities` + `oauth_workspace_keys`.

## Vercel env

| Variable | Required |
|----------|----------|
| `MCP_PUBLIC_URL` | yes |
| `AUTH0_DOMAIN` | yes |
| `AUTH0_AUDIENCE` | yes (`…/mcp`) |
| `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | yes |
| `MCPGRAM_KEY_SECRET` | yes (encrypt per-user keys) |
| `MCPGRAM_BASE_URL` | yes |

**Do not set `MCPGRAM_OAUTH_API_KEY`** — removed. Each user gets their own workspace key.

## Auth0 tips for email

Access tokens may omit `email`. The server calls Auth0 `/userinfo` with the access token when needed. Ensure the API allows OIDC scopes and users grant `openid profile email`.

## Isolation

User A’s Auth0 session never loads User B’s workspace tools.
