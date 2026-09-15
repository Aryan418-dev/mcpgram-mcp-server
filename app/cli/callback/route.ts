import { storeCliAuthCode } from "../../../src/oauth/cli-callback-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(opts: { ok: boolean; title: string; body: string; code?: string | null }) {
  const color = opts.ok ? "#cffe25" : "#ef4444";
  const codeBlock = opts.code
    ? `<p style="margin-top:1.25rem;font-size:12px;color:#a3a3a3">If the CLI is waiting, it will finish automatically. Otherwise paste this into the terminal:</p>
<textarea readonly id="cb" style="width:100%;min-height:88px;margin-top:8px;padding:12px;border-radius:12px;border:1px solid #333;background:#0a0a0a;color:#e5e5e5;font-size:11px;font-family:ui-monospace,monospace">${opts.code.replace(/</g, "<")}</textarea>
<button type="button" onclick="navigator.clipboard.writeText(document.getElementById('cb').value)" style="margin-top:12px;padding:10px 16px;border-radius:999px;border:0;background:#cffe25;color:#000;font-weight:600;cursor:pointer">Copy code</button>`
    : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${opts.title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#fafafa;font-family:system-ui,sans-serif;padding:16px">
<div style="max-width:440px;width:100%;background:#171717;border:1px solid #262626;border-radius:16px;padding:28px;text-align:center">
<div style="font-weight:700;letter-spacing:.06em;margin-bottom:16px">MCPGRAM</div>
<h1 style="font-size:1.25rem;margin:0 0 12px;color:${color}">${opts.title}</h1>
<p style="color:#a3a3a3;line-height:1.55;margin:0">${opts.body}</p>
${codeBlock}
</div></body></html>`;
}

/**
 * Hosted CLI OAuth callback — used when the CLI cannot receive loopback redirects
 * (SSH, Docker, cloud coding agents, mobile browser).
 *
 * Stores the authorization code under `state` so the CLI can poll /cli/callback/poll.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");

  if (err) {
    return new Response(
      page({
        ok: false,
        title: "Authorization failed",
        body: errDesc || err,
      }),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (!code || !state) {
    return new Response(
      page({
        ok: false,
        title: "Missing code",
        body: "No authorization code was returned. Run mcpgram login again.",
      }),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    await storeCliAuthCode(state, code);
  } catch (e) {
    console.error("[cli/callback] store failed", e);
  }

  return new Response(
    page({
      ok: true,
      title: "Signed in",
      body: "Return to your terminal — MCPGRAM CLI will finish automatically. You can close this tab.",
      code,
    }),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}
