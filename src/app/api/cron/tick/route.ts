import { NextResponse, type NextRequest } from "next/server";
import { runScheduledWork } from "@/lib/scheduled-work";
import { authorizedCronRequest } from "@/lib/cron-auth";

/**
 * Poll endpoint that drives the queue. In dev the client shell hits it every
 * ~20s; in prod point a platform cron (Vercel Cron, GH Actions, etc.) at it.
 * Idempotent.
 *
 * When CRON_SECRET is set every request must carry it as
 * `Authorization: Bearer <CRON_SECRET>` (the header Vercel Cron sends) — this
 * also disables the unauthenticated client poller in prod. With no secret set,
 * open in dev (so the poller works with zero config), closed in production.
 */
async function handle(req: NextRequest) {
  if (!authorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { rateLimit, rateLimitHeaders, retryAfterSec } = await import("@/lib/rate-limit");
  // 60 ticks/hour/secret-holder — the full pipeline runs per tick. Vercel Cron
  // is daily; the 20s browser poller and 60s worker stay well under this.
  const rl = await rateLimit("cron:tick", 60, 3_600_000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, {
      status: 429,
      headers: { ...rateLimitHeaders(rl, 60), "Retry-After": String(retryAfterSec(rl.resetAt)) },
    });
  }
  try {
    // Same definition of a tick as scripts/worker.ts — see lib/scheduled-work.
    const r = await runScheduledWork();
    return NextResponse.json({ ok: true, ...r });
  } catch {
    // Internal details (DB/provider errors) stay server-side; the caller
    // holding CRON_SECRET only needs to know the tick failed.
    return NextResponse.json({ ok: false, error: "tick failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
