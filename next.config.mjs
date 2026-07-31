/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/mcp", destination: "/api/mcp" },
      { source: "/mcp/", destination: "/api/mcp" },
    ];
  },
};

export default nextConfig;
