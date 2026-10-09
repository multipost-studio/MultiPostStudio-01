import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseSignedRequest, threadsAccountsFor, threadsAppSecret } from "@/lib/social/meta-signed-request";

export const runtime = "nodejs";

/**
 * POST /api/threads/deauthorize — Meta calls this when a person removes the app from their Threads account.
 * Once the signature verifies, the stored tokens for that Threads user are erased and the account is marked
 * disconnected, so nothing keeps trying to use a grant that no longer exists. The account row and its history
 * stay; the person can reconnect from Integrations. Unsigned requests change nothing. Meta's bare verification
 * ping (no body) is acknowledged.
 */
export async function POST(req: NextRequest) {
  let signed = "";
  try {
    const form = await req.formData();
    const v = form.get("signed_request");
    signed = typeof v === "string" ? v : "";
  } catch {
    return NextResponse.json({ ok: true }); // verification ping
  }
  if (!signed) return NextResponse.json({ ok: true });

  const secret = threadsAppSecret();
  const payload = secret ? parseSignedRequest(signed, secret) : null;
  if (!payload) {
    logger.warn("threads deauthorize rejected: signature did not verify");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (payload.user_id) {
    try {
      for (const acct of await threadsAccountsFor(payload.user_id)) {
        await db.socialAccount.update({ where: { id: acct.id }, data: { accessToken: null, refreshToken: null, status: "disconnected" } });
      }
    } catch (err) {
      logger.error({ err }, "threads deauthorize failed");
      return NextResponse.json({ error: "failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
