import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MCPGRAM",
  description: "MCPGRAM remote MCP server — connect Claude, Cursor, and other AI agents to your workspace tools.",
  applicationName: "MCPGRAM",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
      { url: "/favicon-128.png", type: "image/png", sizes: "128x128" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function Home() {
  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 32,
        maxWidth: 720,
        margin: "0 auto",
        color: "#f5f5f5",
        background: "#000",
        minHeight: "100vh",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-512.png"
          alt="MCPGRAM"
          width={64}
          height={64}
          style={{ borderRadius: 12 }}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>MCPGRAM</h1>
          <p style={{ margin: "4px 0 0", color: "#a3a3a3", fontSize: 14 }}>
            Remote MCP for AI agents
          </p>
        </div>
      </div>
      <p style={{ color: "#a3a3a3", lineHeight: 1.5 }}>
        This host is both the <strong style={{ color: "#f5f5f5" }}>OAuth 2.1 authorization server</strong> and
        the MCP resource server. Connect from Claude, Cursor, VS Code, and more using the MCP endpoint below.
      </p>
      <ul style={{ color: "#a3a3a3", lineHeight: 1.8 }}>
        <li>
          MCP endpoint: <code style={{ color: "#f5f5f5" }}>/mcp</code>
        </li>
        <li>
          Protected resource metadata:{" "}
          <code style={{ color: "#f5f5f5" }}>/.well-known/oauth-protected-resource</code>
        </li>
        <li>
          Authorization server metadata:{" "}
          <code style={{ color: "#f5f5f5" }}>/.well-known/oauth-authorization-server</code>
        </li>
        <li>
          Dynamic client registration: <code style={{ color: "#f5f5f5" }}>POST /register</code>
        </li>
        <li>
          Authorize / consent: <code style={{ color: "#f5f5f5" }}>/authorize</code>
        </li>
      </ul>
      <p style={{ color: "#737373", fontSize: 13 }}>
        Official logo:{" "}
        <a href="/icon-512.png" style={{ color: "#5b8cff" }}>
          /icon-512.png
        </a>{" "}
        (512×512 transparent PNG)
      </p>
    </main>
  );
}
