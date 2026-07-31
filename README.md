# mcpgram-mcp-server

Official **Model Context Protocol (MCP)** server for [MCPGRAM](https://mcpgram.vercel.app).

It is a thin translation layer:

```
Claude / Cursor / VS Code / OpenCode / OpenClaw
        │  MCP (stdio)
        ▼
 mcpgram-mcp-server
        │  HTTPS + Bearer API key
        ▼
 MCPGRAM  GET /api/v1/tools · POST /api/v1/execute
        │
        ▼
 Native connectors & external MCP servers in your workspace
```

No connector code is rewritten. Tools are discovered **dynamically** from your workspace API key. Connect a new GitHub/Slack/Notion/Gmail server in the dashboard and it appears on the next `tools/list` — no rebuild required.

## Requirements

- Node.js **18+**
- A MCPGRAM workspace **API key**  
  Dashboard → open a workspace → **API Keys** → create key (`mcpg_live_…`)

Each API key is scoped to **one workspace**. To use multiple workspaces, register multiple MCP server entries (one key each).

## Installation

```bash
git clone https://github.com/Aryan418-dev/mcpgram-mcp-server.git
cd mcpgram-mcp-server
npm install
npm run build
```

Or run from source without a global install:

```bash
npm install
npm run dev   # tsx src/index.ts
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCPGRAM_API_KEY` | **yes** | — | Workspace API key (`mcpg_live_…`) |
| `MCPGRAM_BASE_URL` | no | `https://mcpgram.vercel.app` | MCPGRAM origin |
| `MCPGRAM_TIMEOUT_MS` | no | `30000` | HTTP timeout |
| `MCPGRAM_MAX_RETRIES` | no | `2` | Retries on 429/5xx |
| `MCPGRAM_LOG_LEVEL` | no | `info` | `debug` \| `info` \| `warn` \| `error` |

Logs always go to **stderr** so they never corrupt the MCP stdio stream.

## Scripts

```bash
npm run dev       # run TypeScript directly (tsx)
npm run build     # compile to dist/
npm start         # node dist/index.js
npm run typecheck # tsc --noEmit
```

## Connect to Claude Desktop

Config file locations:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcpgram": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcpgram-mcp-server/dist/index.js"],
      "env": {
        "MCPGRAM_API_KEY": "mcpg_live_YOUR_KEY"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## Connect to Claude Code

```bash
claude mcp add mcpgram --env MCPGRAM_API_KEY=mcpg_live_YOUR_KEY -- node /ABSOLUTE/PATH/TO/mcpgram-mcp-server/dist/index.js
```

## Connect to Cursor

Edit `~/.cursor/mcp.json` or project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mcpgram": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcpgram-mcp-server/dist/index.js"],
      "env": {
        "MCPGRAM_API_KEY": "mcpg_live_YOUR_KEY"
      }
    }
  }
}
```

## Connect to VS Code / OpenCode / OpenClaw / Windsurf

Use the same stdio shape:

```json
{
  "mcpServers": {
    "mcpgram": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcpgram-mcp-server/dist/index.js"],
      "env": {
        "MCPGRAM_API_KEY": "mcpg_live_YOUR_KEY"
      }
    }
  }
}
```

## How tool names work

MCPGRAM may expose the same tool name on multiple servers. This bridge prefixes names:

```
GitHub (native)  +  list_repos  →  github_native__list_repos
```

On `tools/call`, the name is mapped back to the internal `tool_id` and forwarded to `POST /api/v1/execute`.

## Manual smoke test

```bash
export MCPGRAM_API_KEY=mcpg_live_...
npm run build
curl -s -H "Authorization: Bearer $MCPGRAM_API_KEY" \
  https://mcpgram.vercel.app/api/v1/tools | head
npm start
```

## Project layout

```
src/
  index.ts     # entry — stdio transport
  server.ts    # MCP Server + handlers
  api.ts       # HTTP client to MCPGRAM
  auth.ts      # Bearer headers
  tools.ts     # tools/list mapping + registry
  execute.ts   # tools/call → /api/v1/execute
  config.ts    # env validation (Zod)
  logger.ts    # stderr logger
  types.ts     # shared types
examples/
  claude_desktop_config.json
```

## License

MIT
