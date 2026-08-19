import { UNIVERSAL_TOOLS } from "../../../../src/universal/defs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Cache-Control": "public, max-age=60",
  "Access-Control-Allow-Origin": "*",
};

/**
 * Static MCP server card for registries (e.g. Smithery) that cannot complete
 * an authenticated tools/list scan. Workspace-specific connector tools are
 * discovered live after OAuth; this card documents the stable universal layer.
 */
export async function GET() {
  const card = {
    serverInfo: {
      name: "MCPGRAM",
      version: "1.0.0",
      title: "MCPGRAM — connectivity layer for AI agents",
      description:
        "Connect Slack, GitHub, Google, Salesforce, and 30+ apps through one OAuth control plane. Expose governed tools to Claude, Cursor, and other MCP clients via Streamable HTTP.",
      websiteUrl: "https://mcpgram.vercel.app",
      docsUrl: "https://mcpgram.vercel.app/docs",
    },
    authentication: {
      required: true,
      schemes: ["oauth2"],
      authorizationServers: ["https://mcpgram-mcp-server.vercel.app"],
    },
    transport: {
      type: "streamable-http",
      url: "https://mcpgram-mcp-server.vercel.app/mcp",
    },
    tools: UNIVERSAL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    resources: [],
    prompts: [],
  };

  return Response.json(card, { headers: CORS });
}
