export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 720 }}>
      <h1>mcpgram-mcp-server</h1>
      <p>
        MCPGRAM remote MCP — Streamable HTTP. Claude.ai uses <strong>Auth0</strong> as the
        authorization server; this host is the resource server.
      </p>
      <ul>
        <li>
          MCP endpoint: <code>/mcp</code>
        </li>
        <li>
          Protected resource metadata:{" "}
          <code>/.well-known/oauth-protected-resource</code>
        </li>
        <li>
          AS metadata (proxied from Auth0 when configured):{" "}
          <code>/.well-known/oauth-authorization-server</code>
        </li>
        <li>
          Health: <a href="/mcp?health=1">/mcp?health=1</a>
        </li>
      </ul>
      <p>
        Auth: Auth0 Bearer JWT <em>or</em> <code>Authorization: Bearer mcpg_live_…</code>
      </p>
    </main>
  );
}
