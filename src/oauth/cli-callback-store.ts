import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.OAUTH_JWT_SECRET;
  if (!s || s.length < 16) throw new Error("OAUTH_JWT_SECRET required");
  return s;
}

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

/** In-memory fallback (single-instance / cold start best-effort). */
const memory = new Map<string, { code: string; exp: number }>();

const TTL_SEC = 300;

export async function storeCliAuthCode(state: string, code: string): Promise<void> {
  if (!state || !code) return;
  const key = `cli:oauth:${state}`;
  try {
    if (getRedis()) {
      await redisCommand(["SET", key, code, "EX", TTL_SEC]);
      return;
    }
  } catch (err) {
    console.error("[cli-callback] redis store failed", err);
  }
  memory.set(key, { code, exp: Date.now() + TTL_SEC * 1000 });
}

export async function takeCliAuthCode(state: string): Promise<string | null> {
  if (!state) return null;
  const key = `cli:oauth:${state}`;
  try {
    if (getRedis()) {
      const code = (await redisCommand(["GET", key])) as string | null;
      if (code) {
        await redisCommand(["DEL", key]);
        return code;
      }
    }
  } catch (err) {
    console.error("[cli-callback] redis take failed", err);
  }
  const row = memory.get(key);
  if (!row) return null;
  memory.delete(key);
  if (row.exp < Date.now()) return null;
  return row.code;
}

/** Sign a one-time display token so the success page can show a short reference. */
export function signCliTicket(payload: { state: string; code: string }): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + TTL_SEC })).toString(
    "base64url"
  );
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}
