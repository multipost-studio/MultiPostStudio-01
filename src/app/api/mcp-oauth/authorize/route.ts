import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { startAuthorization } from "@/lib/mcp/authorize-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (message: string, status = 400) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Can't connect</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#1b1b1f"><h1 style="font-size:1.25rem">We can't connect this app</h1>` +
      `<p>${message.replace(/[<>&"]/g, "")}</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/**
 * GET /api/mcp-oauth/authorize — where an AI assistant sends the person to connect. Validates the request and hands over to the
 * consent screen (/connect/authorize), which is where the person signs in and chooses what to allow.
 */
export async function GET(req: NextRequest) {
  const ip = await clientIp();
  const rl = await rateLimit(`mcp-authorize:${ip}`, 60, 60_000);
  if (!rl.ok) return page("Too many attempts. Wait a minute and try again.", 429);
  try {
    const out = await startAuthorization(new URL(req.url).searchParams);
    if (out.kind === "page-error") return page(out.message);
    return new Response(null, { status: 302, headers: { Location: out.location, "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error({ err: e }, "mcp oauth authorize failed");
    return page("Something went wrong on our side. Try again in a moment.", 500);
  }
}
