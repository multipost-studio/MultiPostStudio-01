import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual, createHmac } from "node:crypto";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// No hardcoded fallback: the previous default token was public in the repo,
// so anyone could complete Meta's URL verification against this endpoint.
// Configure META_WEBHOOK_VERIFY_TOKEN; without it verification is refused.
function expectedVerifyToken(): string | null {
  const t = env.META_WEBHOOK_VERIFY_TOKEN ?? process.env.META_WEBHOOK_VERIFY_TOKEN;
  return t && t.length >= 16 ? t : null;
}

function verifyMetaSignature(raw: string, sigHeader: string | null): boolean {
  const secret = env.META_APP_SECRET ?? process.env.META_APP_SECRET;
  // Unconfigured secret → cannot verify; caller keeps log-only behavior but
  // throttled. Returns true here so existing flows don't break; verification
  // becomes enforcing the moment the secret is set.
  if (!secret) return true;
  if (!sigHeader?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(sigHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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
    const { rateLimit } = await import("@/lib/rate-limit");
    const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "unknown";
    const rl = await rateLimit(`webhook:meta:${ip}`, 300, 60_000);
    if (!rl.ok) return NextResponse.json({ ok: true }, { status: 429 });
  } catch {
    /* fail-open — handler is log-only */
  }
  try {
    const raw = await req.text();
    if (raw.length > 1024 * 1024) return NextResponse.json({ ok: true });
    // Enforcing once META_APP_SECRET is set; log-only until then so existing
    // verification flows don't break. Any future state-changing use must
    // require verification unconditionally.
    if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
      logger.warn("Meta webhook signature mismatch");
      return NextResponse.json({ ok: true });
    }
    let object: unknown;
    try {
      object = (JSON.parse(raw) as { object?: unknown })?.object;
    } catch {
      object = undefined;
    }
    logger.info({ object }, "Meta webhook event received");
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.warn({ err }, "Meta webhook unparseable event received");
    return NextResponse.json({ ok: true });
  }
}
