import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const { rateLimit } = await import("@/lib/rate-limit");
  // 600/min shared — health is public for load-balancers; throttle only to
  // blunt flood-driven DB probes. Fail-open: a limiter error never marks
  // the service down.
  try {
    const rl = await rateLimit("health:global", 600, 60_000);
    if (!rl.ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  } catch {
    /* fail-open */
  }
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
  // Depth beyond SELECT 1: queue backlog and worker freshness are what
  // actually page someone at 3am. Both reads are tiny indexed queries;
  // each is independently best-effort so a slow one can't fail the check.
  // SECURITY: this endpoint is public (load-balancers). Report coarse
  // booleans only — exact backlog counts and abuse-bucket telemetry stay
  // internal; they help fingerprint load and attack posture.
  let queued = -1;
  try {
    queued = await db.publishJob.count({ where: { status: { in: ["queued", "running"] } } });
  } catch {
    /* reported as unknown below */
  }
  let tickAgeSec = -1;
  try {
    const stamp = await db.systemSetting.findUnique({ where: { key: "tick_last_run" }, select: { value: true } });
    if (stamp) {
      const at = Date.parse(JSON.parse(stamp.value) as string);
      if (Number.isFinite(at)) tickAgeSec = Math.max(0, Math.round((Date.now() - at) / 1000));
    }
  } catch {
    /* reported as unknown below */
  }
  return NextResponse.json({
    ok: true,
    service: "multipost-studio",
    db: "up",
    time: new Date().toISOString(),
    queue: queued < 0 ? "unknown" : queued > 50 ? "backlogged" : "flowing",
    worker: tickAgeSec < 0 ? "unknown" : tickAgeSec > 300 ? "stale" : "live",
  });
}
