import { z } from "zod";
import type { LogLevel } from "./types.js";

const ConfigSchema = z.object({
  apiKey: z.string().min(1, "MCPGRAM_API_KEY is required"),
  baseUrl: z.string().url().default("https://mcpgram.vercel.app"),
  timeoutMs: z.coerce.number().int().positive().default(30_000),
  maxRetries: z.coerce.number().int().min(0).max(5).default(2),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse({
    apiKey: env.MCPGRAM_API_KEY,
    baseUrl: env.MCPGRAM_BASE_URL ?? "https://mcpgram.vercel.app",
    timeoutMs: env.MCPGRAM_TIMEOUT_MS ?? 30_000,
    maxRetries: env.MCPGRAM_MAX_RETRIES ?? 2,
    logLevel: (env.MCPGRAM_LOG_LEVEL as LogLevel | undefined) ?? "info",
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
