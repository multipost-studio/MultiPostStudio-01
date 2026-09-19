import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
  // Depth beyond SELECT 1: queue backlog and worker freshness are what
  // actually page someone at 3am. Both reads are tiny indexed queries;
  // each is independently best-effort so a slow one can't fail the check.
  let queued = -1;
  try {
    queued = await db.publishJob.count({ where: { status: { in: ["queued", "running"] } } });
  } catch {
    /* reported as -1 below */
  }
  let tickAgeSec = -1;
  try {
    const stamp = await db.systemSetting.findUnique({ where: { key: "tick_last_run" }, select: { value: true } });
    if (stamp) {
      const at = Date.parse(JSON.parse(stamp.value) as string);
      if (Number.isFinite(at)) tickAgeSec = Math.max(0, Math.round((Date.now() - at) / 1000));
    }
  } catch {
    /* reported as -1 below */
  }
  return NextResponse.json({
    ok: true,
    service: "multipost-studio",
    db: "up",
    time: new Date().toISOString(),
    queue: { openJobs: queued },
    worker: { lastTickAgeSec: tickAgeSec },
  });
}
