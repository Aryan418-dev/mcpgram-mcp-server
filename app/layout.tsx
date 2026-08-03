export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>MCPGRAM</title>
        <meta
          name="description"
          content="MCPGRAM remote MCP server — connect Claude and other AI agents to your workspace tools."
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon.png" />
        <link rel="icon" type="image/png" sizes="128x128" href="/favicon-128.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/style.css"
        />
      </head>
      <body
        style={{
          margin: 0,
          background: "#000000",
          color: "#FFFFFF",
          minHeight: "100vh",
          fontFamily:
            "Geist, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
