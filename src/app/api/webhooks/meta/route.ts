import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export const DEFAULT_META_VERIFY_TOKEN = "multipost_meta_verify_token_2026";

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

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || DEFAULT_META_VERIFY_TOKEN;

  if (mode === "subscribe" && token === expectedToken) {
    logger.info("Meta webhook verified successfully");
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  logger.warn({ mode, token }, "Meta webhook verification token mismatch");
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
