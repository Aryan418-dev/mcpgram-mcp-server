import { takeCliAuthCode } from "../../../../src/oauth/cli-callback-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** CLI polls this after opening the browser (remote / no loopback). */
export async function GET(req: Request) {
  const state = new URL(req.url).searchParams.get("state")?.trim();
  if (!state) {
    return Response.json({ error: "state required" }, { status: 400, headers: CORS });
  }
  const code = await takeCliAuthCode(state);
  if (!code) {
    return Response.json({ status: "pending" }, { status: 200, headers: CORS });
  }
  return Response.json({ status: "ready", code }, { status: 200, headers: CORS });
}
