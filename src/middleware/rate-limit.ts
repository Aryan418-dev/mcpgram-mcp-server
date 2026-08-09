import { createHash } from "node:crypto";
import { logger } from "../logger.js";

type Bucket = { count: number; resetAt: number };

function getRedis(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function redisCommand(args: (string | number)[]): Promise<unknown> {
  const r = getRedis();
  if (!r) return null;
  const res = await fetch(r.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${r.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

/**
 * Shared rate limiter: Upstash Redis when configured, else in-memory
 * (per serverless isolate — weaker under concurrency).
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number = 120,
    private readonly windowMs: number = 60_000,
    private readonly prefix: string = "rl:mcp:"
  ) {}

  private keyHash(key: string): string {
    return createHash("sha256").update(key).digest("hex").slice(0, 16);
  }

  async check(apiKey: string): Promise<{ allowed: boolean; retryAfterMs: number; remaining: number }> {
    const id = this.keyHash(apiKey);
    const redisKey = `${this.prefix}${id}`;

    try {
      if (getRedis()) {
        const count = Number(await redisCommand(["INCR", redisKey]));
        if (count === 1) {
          await redisCommand(["PEXPIRE", redisKey, this.windowMs]);
        }
        if (count > this.max) {
          const ttl = Number(await redisCommand(["PTTL", redisKey]));
          logger.warn("Rate limit exceeded (redis)", { keyPrefix: id });
          return {
            allowed: false,
            retryAfterMs: ttl > 0 ? ttl : this.windowMs,
            remaining: 0,
          };
        }
        return {
          allowed: true,
          retryAfterMs: 0,
          remaining: Math.max(0, this.max - count),
        };
      }
    } catch (err) {
      logger.warn("Redis rate limit failed, falling back to memory", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const now = Date.now();
    let bucket = this.buckets.get(id);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(id, bucket);
    }
    if (bucket.count >= this.max) {
      const retryAfterMs = Math.max(0, bucket.resetAt - now);
      logger.warn("Rate limit exceeded (memory)", { keyPrefix: id, retryAfterMs });
      return { allowed: false, retryAfterMs, remaining: 0 };
    }
    bucket.count += 1;
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.max(0, this.max - bucket.count),
    };
  }

  sweep() {
    const now = Date.now();
    for (const [id, b] of this.buckets) {
      if (now >= b.resetAt) this.buckets.delete(id);
    }
  }
}

export const globalRateLimiter = new RateLimiter(
  Number(process.env.MCPGRAM_RATE_LIMIT_MAX ?? 60),
  Number(process.env.MCPGRAM_RATE_LIMIT_WINDOW_MS ?? 60_000)
);

/** OAuth endpoint limiter (register / token) — tighter defaults. */
export const oauthRateLimiter = new RateLimiter(
  Number(process.env.MCPGRAM_OAUTH_RATE_LIMIT_MAX ?? 30),
  Number(process.env.MCPGRAM_OAUTH_RATE_LIMIT_WINDOW_MS ?? 60_000),
  "rl:oauth:"
);

export function clientIpFromRequest(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
