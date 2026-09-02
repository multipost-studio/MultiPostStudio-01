import { NextResponse } from "next/server";
import { runDueJobs } from "@/lib/adapters/queue";
import { runDueAutomations } from "@/lib/adapters/automations";

/**
 * Poll endpoint that drives the stub queue. Called from the client shell every
 * ~20s and safe to hit from a real cron. Idempotent.
 */
export async function GET() {
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

export const POST = GET;
