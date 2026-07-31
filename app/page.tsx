export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 640 }}>
      <h1>mcpgram-mcp-server</h1>
      <p>
        Official MCP bridge for MCPGRAM — Streamable HTTP + OAuth 2.1 for Claude.ai.
      </p>
      <ul>
        <li>
          MCP endpoint: <code>/mcp</code>
        </li>
        <li>
          OAuth discovery: <code>/.well-known/oauth-authorization-server</code>
        </li>
        <li>
          Protected resource: <code>/.well-known/oauth-protected-resource</code>
        </li>
        <li>
          Authorize: <code>/authorize</code>
        </li>
        <li>
          Token: <code>/token</code>
        </li>
        <li>
          Register (DCR): <code>/register</code>
        </li>
        <li>
          Health: <a href="/mcp?health=1">/mcp?health=1</a>
        </li>
      </ul>
      <p>
        Auth: OAuth access token <em>or</em>{" "}
        <code>Authorization: Bearer mcpg_live_…</code>
      </p>
    </main>
  );
}
