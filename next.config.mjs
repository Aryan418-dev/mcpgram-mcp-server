/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/mcp", destination: "/api/mcp" },
      { source: "/mcp/", destination: "/api/mcp" },
    ];
  },
  webpack: (config) => {
    // TypeScript ESM uses .js extensions in relative imports; map them to .ts
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
