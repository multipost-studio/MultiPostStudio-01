import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { effectOf, mergeStatus, verifySvix, type EmailStatus } from "@/lib/resend-events";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/resend: delivery events (delivered, bounced, complained, opened, clicked) for emails sent through
 * Resend. Set RESEND_WEBHOOK_SECRET to the signing secret Resend shows for this endpoint; without it the endpoint refuses
 * everything, so an unsigned request is never trusted. Events are matched to our delivery log by Resend's message id and
 * applied idempotently (a repeated or out-of-order event cannot make a row look better than it is).
 */
export async function POST(req: NextRequest) {
  const secret = env.RESEND_WEBHOOK_SECRET ?? process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });

  const raw = await req.text();
  const valid = verifySvix(secret, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") }, raw);
  if (!valid) return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });

  let event: { type?: unknown; data?: { email_id?: unknown } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const effect = typeof event.type === "string" ? effectOf(event.type) : null;
  const emailId = typeof event.data?.email_id === "string" ? event.data.email_id : null;
  // Events we do not track (or that name no email) are acknowledged so Resend does not keep retrying them.
  if (!effect || !emailId) return NextResponse.json({ ok: true, ignored: true });

  try {
    const row = await db.emailLog.findFirst({ where: { providerId: emailId }, select: { id: true, status: true } });
    if (!row) return NextResponse.json({ ok: true, ignored: true }); // an email we did not log (before logging started, or another app)
    await db.emailLog.update({
      where: { id: row.id },
      data: { ...(effect.status ? { status: mergeStatus(row.status, effect.status as EmailStatus) } : {}), ...(effect.opened ? { opened: true } : {}), ...(effect.clicked ? { clicked: true } : {}) },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "resend webhook failed");
    // Resend retries on a 5xx, which is what we want for a transient database problem.
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
