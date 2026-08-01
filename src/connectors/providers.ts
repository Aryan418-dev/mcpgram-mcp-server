/** Third-party connector OAuth providers (GitHub, Slack, Notion, …). */

export type ProviderId = "github" | "slack" | "notion";

export type ProviderConfig = {
  id: ProviderId;
  name: string;
  description: string;
  logoUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  extraAuthParams?: Record<string, string>;
};

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  github: {
    id: "github",
    name: "GitHub",
    description: "Repos, issues, pull requests, and code",
    logoUrl: "https://www.google.com/s2/favicons?domain=github.com&sz=128",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "repo"],
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  slack: {
    id: "slack",
    name: "Slack",
    description: "Channels, messages, and workspace data",
    logoUrl: "https://www.google.com/s2/favicons?domain=slack.com&sz=128",
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:read", "chat:write", "users:read"],
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
  notion: {
    id: "notion",
    name: "Notion",
    description: "Pages, databases, and workspace content",
    logoUrl: "https://www.google.com/s2/favicons?domain=notion.so&sz=128",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    clientIdEnv: "NOTION_CLIENT_ID",
    clientSecretEnv: "NOTION_CLIENT_SECRET",
    extraAuthParams: { owner: "user" },
  },
};

export function isProviderId(v: string): v is ProviderId {
  return v === "github" || v === "slack" || v === "notion";
}

export function providerConfigured(p: ProviderConfig): boolean {
  const id = process.env[p.clientIdEnv];
  const secret = process.env[p.clientSecretEnv];
  return Boolean(id && secret && id.length > 2 && secret.length > 2);
}
