import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { appUrl } from "@/lib/env";
import { logAudit } from "@/lib/events";
import { debumpUsage } from "@/lib/adapters/billing";
import { parseSignedRequest, threadsAccountsFor, threadsAppSecret } from "@/lib/social/meta-signed-request";

export const runtime = "nodejs";

/**
 * POST /api/threads/delete — Meta's data-deletion-request callback. It must answer with { url, confirmation_code }
 * pointing at a page where the person can check the status.
 *
 * The request is only acted on when its signed_request verifies against the app secret (anyone can POST here).
 * A verified request deletes every connected Threads account for that Threads user: the encrypted tokens, the
 * account and its channels. That is the data this app holds for Threads, so the status page can say it is done.
 * Anything unsigned or malformed gets a 400 and deletes nothing.
 */
export async function POST(req: NextRequest) {
  try {
    const { rateLimit } = await import("@/lib/rate-limit");
    const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "unknown";
    const rl = await rateLimit(`threads-delete:${ip}`, 30, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });
  } catch {
    /* fail open: the signature check below is the real gate */
  }

  const secret = threadsAppSecret();
  if (!secret) {
    logger.error("threads data-deletion request received but no app secret is configured");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  let signed = "";
  try {
    const form = await req.formData();
    const v = form.get("signed_request");
    signed = typeof v === "string" ? v : "";
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const payload = parseSignedRequest(signed, secret);
  if (!payload) {
    logger.warn("threads data-deletion request rejected: signature did not verify");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const code = randomUUID();
  let deleted = 0;
  if (payload.user_id) {
    try {
      for (const acct of await threadsAccountsFor(payload.user_id)) {
        // A data-deletion request means gone: remove this account's post rows too (a disconnect keeps published history).
        await db.postChannel.deleteMany({ where: { channel: { socialAccountId: acct.id } } });
        await db.socialAccount.delete({ where: { id: acct.id } });
        if (acct._count.channels > 0) await debumpUsage(acct.workspace.orgId, "channels", acct._count.channels).catch(() => undefined);
        await logAudit({
          orgId: acct.workspace.orgId,
          action: "threads.data_deletion",
          targetType: "socialAccount",
          targetId: acct.id,
          metadata: { code, handle: acct.handle },
        }).catch(() => undefined);
        deleted++;
      }
    } catch (err) {
      // Meta will retry a non-2xx; nothing was reported as done.
      logger.error({ err, code }, "threads data-deletion failed");
      return NextResponse.json({ error: "deletion failed" }, { status: 500 });
    }
  }
  logger.info({ code, deleted }, "threads data-deletion request processed");
  return NextResponse.json({ url: appUrl(`/legal/data-deletion?code=${code}`), confirmation_code: code });
}
