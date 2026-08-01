export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 720 }}>
      <h1>mcpgram-mcp-server</h1>
      <p>
        MCPGRAM remote MCP — Streamable HTTP. This host is both the{" "}
        <strong>OAuth 2.1 authorization server</strong> and the MCP resource server.
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
          Authorization server metadata:{" "}
          <code>/.well-known/oauth-authorization-server</code>
        </li>
        <li>
          Dynamic client registration: <code>POST /register</code>
        </li>
        <li>
          Authorize / consent: <code>/authorize</code>
        </li>
        <li>
          Token: <code>POST /token</code>
        </li>
      </ul>
      <p>
        Auth: OAuth access token from MCPGRAM consent, or{" "}
        <code>Authorization: Bearer mcpg_live_…</code>
      </p>
    </main>
  );
}
