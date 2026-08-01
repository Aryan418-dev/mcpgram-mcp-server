import { z } from "zod";
import type { LogLevel } from "./types.js";

const ConfigSchema = z.object({
  apiKey: z.string().min(1, "MCPGRAM_API_KEY is required"),
  /** Additional workspace API keys (multi-workspace OAuth). */
  extraApiKeys: z.array(z.string()).default([]),
  workspaceIds: z.array(z.string()).default([]),
  workspaceNames: z.record(z.string()).default({}),
  userId: z.string().optional(),
  baseUrl: z.string().url().default("https://mcpgram.vercel.app"),
  timeoutMs: z.coerce.number().int().positive().default(30_000),
  maxRetries: z.coerce.number().int().min(0).max(5).default(2),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  rateLimitMax: z.coerce.number().int().positive().default(120),
  rateLimitWindowMs: z.coerce.number().int().positive().default(60_000),
  httpPort: z.coerce.number().int().positive().default(3100),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse({
    apiKey: env.MCPGRAM_API_KEY,
    extraApiKeys: [],
    workspaceIds: [],
    workspaceNames: {},
    baseUrl: env.MCPGRAM_BASE_URL ?? "https://mcpgram.vercel.app",
    timeoutMs: env.MCPGRAM_TIMEOUT_MS ?? 30_000,
    maxRetries: env.MCPGRAM_MAX_RETRIES ?? 2,
    logLevel: (env.MCPGRAM_LOG_LEVEL as LogLevel | undefined) ?? "info",
    rateLimitMax: env.MCPGRAM_RATE_LIMIT_MAX ?? 120,
    rateLimitWindowMs: env.MCPGRAM_RATE_LIMIT_WINDOW_MS ?? 60_000,
    httpPort: env.PORT ?? env.MCPGRAM_HTTP_PORT ?? 3100,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${msg}`);
  }

  return {
    ...parsed.data,
    baseUrl: parsed.data.baseUrl.replace(/\/+$/, ""),
  };
}

/** Build config for a single HTTP request (API key from Authorization header). */
export function configFromApiKey(
  apiKey: string,
  env: NodeJS.ProcessEnv = process.env
): Config {
  return loadConfig({ ...env, MCPGRAM_API_KEY: apiKey });
}

export type AuthSession = {
  apiKey: string;
  apiKeys: string[];
  workspaceIds: string[];
  workspaceNames: Record<string, string>;
  userId?: string;
};

export function configFromSession(
  session: AuthSession,
  env: NodeJS.ProcessEnv = process.env
): Config {
  const base = loadConfig({ ...env, MCPGRAM_API_KEY: session.apiKey });
  const extra = session.apiKeys.filter((k) => k && k !== session.apiKey);
  return {
    ...base,
    extraApiKeys: extra,
    workspaceIds: session.workspaceIds,
    workspaceNames: session.workspaceNames,
    userId: session.userId,
  };
}

/** All API keys for this session (primary first). */
export function allApiKeys(config: Config): string[] {
  const keys = [config.apiKey, ...(config.extraApiKeys ?? [])];
  return [...new Set(keys.filter(Boolean))];
}
