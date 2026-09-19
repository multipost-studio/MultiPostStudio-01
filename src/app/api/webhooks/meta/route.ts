import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

// No hardcoded fallback: the previous default token was public in the repo,
// so anyone could complete Meta's URL verification against this endpoint.
// Configure META_WEBHOOK_VERIFY_TOKEN; without it verification is refused.
function expectedVerifyToken(): string | null {
  const t = process.env.META_WEBHOOK_VERIFY_TOKEN;
  return t && t.length >= 16 ? t : null;
}

/**
 * GET /api/webhooks/meta
 * Meta sends a GET request to verify the webhook callback URL.
 * Query Parameters:
 * - hub.mode: "subscribe"
 * - hub.challenge: challenge token to echo back
 * - hub.verify_token: secret token configured in Meta Developer Console
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = expectedVerifyToken();

  // timingSafeEqual throws on length mismatch — compare lengths first.
  const tokenBuf = token ? Buffer.from(token) : null;
  const expectedBuf = expectedToken ? Buffer.from(expectedToken) : null;
  if (
    mode === "subscribe" &&
    tokenBuf &&
    expectedBuf &&
    tokenBuf.length === expectedBuf.length &&
    timingSafeEqual(tokenBuf, expectedBuf)
  ) {
    logger.info("Meta webhook verified successfully");
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Never log the supplied token — it is a bearer secret.
  logger.warn({ mode, match: false }, "Meta webhook verification token mismatch");
  return new Response("Forbidden", { status: 403 });
}

/**
 * POST /api/webhooks/meta
 * Meta sends real-time updates (e.g., messages, comments, mentions).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    logger.info({ object: body?.object }, "Meta webhook event received");
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.warn({ err }, "Meta webhook unparseable event received");
    return NextResponse.json({ ok: true });
  }
}
