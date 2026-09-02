import { NextResponse, type NextRequest } from "next/server";
import { runDueJobs } from "@/lib/adapters/queue";
import { runDueAutomations } from "@/lib/adapters/automations";
import { env } from "@/lib/env";

/**
 * Poll endpoint that drives the queue. In dev the client shell hits it every
 * ~20s; in prod point a platform cron (Vercel Cron, GH Actions, etc.) at it.
 * Idempotent.
 *
 * When CRON_SECRET is set every request must carry it as
 * `Authorization: Bearer <CRON_SECRET>` (the header Vercel Cron sends) — this
 * also disables the unauthenticated client poller in prod. With no secret set
 * (dev) the endpoint is open so the poller keeps working with zero config.
 */
function authorized(req: NextRequest): boolean {
  if (!env.CRON_SECRET) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${env.CRON_SECRET}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const jobs = await runDueJobs();
    const autos = await runDueAutomations();
    return NextResponse.json({ ok: true, ...jobs, automations: autos.ran });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "tick failed" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
