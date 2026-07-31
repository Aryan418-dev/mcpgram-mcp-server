# mcpgram-mcp-server

Official **Model Context Protocol (MCP)** server for [MCPGRAM](https://mcpgram.vercel.app).

Supports **two transports**:

| Transport | Use case | Entry |
|-----------|----------|-------|
| **stdio** | Claude Desktop, Cursor local, Claude Code | `node dist/index.js` |
| **Streamable HTTP** | Claude Chat remote, remote agents | `POST /mcp` |

```
Local  ──stdio──► mcpgram-mcp-server ──HTTPS──► MCPGRAM API ──► connectors
Remote ─HTTP/mcp► same server logic   ──HTTPS──► MCPGRAM API ──► connectors
```

## Install

```bash
git clone https://github.com/Aryan418-dev/mcpgram-mcp-server.git
cd mcpgram-mcp-server
npm install
npm run build
```

## Local stdio

```bash
export MCPGRAM_API_KEY=mcpg_live_...
npm start
```

Claude Desktop / Cursor:

```json
{
  "mcpServers": {
    "mcpgram": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcpgram-mcp-server/dist/index.js"],
      "env": { "MCPGRAM_API_KEY": "mcpg_live_YOUR_KEY" }
    }
  }
}
```

## Local Streamable HTTP

```bash
npm run build && npm run start:http
# http://127.0.0.1:3100/mcp
curl -s 'http://127.0.0.1:3100/mcp?health=1'
```

Every request needs:

```http
Authorization: Bearer mcpg_live_YOUR_KEY
```

## Deploy on Vercel

1. Import this repo (Framework: **Next.js**).
2. Optional env: `MCPGRAM_BASE_URL`, `MCPGRAM_RATE_LIMIT_MAX`.
3. Deploy.

Endpoints:

- `https://<project>.vercel.app/mcp`
- `https://<project>.vercel.app/api/mcp`

### Claude Chat (remote MCP)

- **URL:** `https://<deployment>.vercel.app/mcp`
- **Header:** `Authorization: Bearer mcpg_live_YOUR_KEY`

Flow: Claude Chat → `/mcp` → initialize → tools/list → tools/call → MCPGRAM → GitHub/Slack/Notion.

### Cursor / HTTP clients

```json
{
  "mcpServers": {
    "mcpgram-remote": {
      "url": "https://<deployment>.vercel.app/mcp",
      "headers": { "Authorization": "Bearer mcpg_live_YOUR_KEY" }
    }
  }
}
```

## Auth & multi-workspace

- **stdio:** one process key = one workspace.
- **HTTP:** Bearer token per request selects workspace (many keys, one deployment).

Invalid key → 401. Rate limit → 429.

## Scripts

```bash
npm run build / start          # stdio
npm run start:http / dev:http  # standalone HTTP
npm run dev:next / build:next  # Next.js (Vercel)
```

## Layout

```
src/index.ts              # stdio
src/http.ts               # standalone HTTP
src/server.ts             # shared MCP factory
src/transport/http.ts     # Streamable HTTP
src/middleware/auth.ts
src/middleware/rate-limit.ts
app/api/mcp/route.ts      # Vercel route
```

## License

MIT
