export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>mcpgram-mcp-server</h1>
      <p>
        MCP Streamable HTTP endpoint: <code>/mcp</code>
      </p>
      <p>
        Auth header: <code>Authorization: Bearer YOUR_API_KEY</code>
      </p>
      <p>
        Health: <a href="/mcp?health=1">/mcp?health=1</a>
      </p>
    </main>
  );
}
