import { NextResponse, type NextRequest } from "next/server";
import { authorizedCronRequest } from "@/lib/cron-auth";
import { sendWeeklyDigests } from "@/lib/digest";

/**
 * Weekly analytics digest. Point a platform cron at it (Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>`). Guarded the same way as /api/cron/tick.
 * Sends only on Mondays unless `?force=1`.
 */
async function handle(req: NextRequest) {
  if (!authorizedCronRequest(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force && new Date().getUTCDay() !== 1) {
    return NextResponse.json({ ok: true, skipped: "not monday" });
  }
  try {
    const res = await sendWeeklyDigests({ force });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "digest failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
