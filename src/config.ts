import { z } from "zod";
import type { LogLevel } from "./types.js";

const ConfigSchema = z.object({
  apiKey: z.string().min(1, "MCPGRAM_API_KEY is required"),
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
