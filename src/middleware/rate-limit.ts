import { createHash } from "node:crypto";
import { logger } from "../logger.js";

type Bucket = { count: number; resetAt: number };

/**
 * Simple sliding-window rate limiter (in-memory).
 * Suitable for single-instance / local HTTP and best-effort on Vercel
 * (each serverless isolate has its own map).
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number = 120,
    private readonly windowMs: number = 60_000
  ) {}

  private keyHash(key: string): string {
    return createHash("sha256").update(key).digest("hex").slice(0, 16);
  }

  check(apiKey: string): { allowed: boolean; retryAfterMs: number; remaining: number } {
    const id = this.keyHash(apiKey);
    const now = Date.now();
    let bucket = this.buckets.get(id);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(id, bucket);
    }

    if (bucket.count >= this.max) {
      const retryAfterMs = Math.max(0, bucket.resetAt - now);
      logger.warn("Rate limit exceeded", { keyPrefix: id, retryAfterMs });
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
  Number(process.env.MCPGRAM_RATE_LIMIT_MAX ?? 120),
  Number(process.env.MCPGRAM_RATE_LIMIT_WINDOW_MS ?? 60_000)
);
