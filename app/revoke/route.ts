import { revokePresentedToken } from "../../src/oauth/tokens";
import { oauthRateLimiter, clientIpFromRequest } from "../../src/middleware/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function parseBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await req.json()) as Record<string, string>;
  }
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

/** RFC 7009 Token Revocation */
export async function POST(req: Request) {
  const rl = await oauthRateLimiter.check(`revoke:${clientIpFromRequest(req)}`);
  if (!rl.allowed) {
    return new Response(null, {
      status: 429,
      headers: {
        ...CORS,
        "Retry-After": String(Math.max(1, Math.ceil(rl.retryAfterMs / 1000))),
      },
    });
  }

  try {
    const body = await parseBody(req);
    const token = body.token || "";
    if (token) {
      await revokePresentedToken(token);
    }
    // Always 200 per RFC 7009 (do not leak token validity)
    return new Response(null, { status: 200, headers: CORS });
  } catch {
    return new Response(null, { status: 200, headers: CORS });
  }
}
