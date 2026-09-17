import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { recommendTimes } from "@/lib/scheduling";
import { QueueView } from "./queue-view";

export const metadata: Metadata = { title: "Queue" };

export default async function QueuePage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;

  const [channels, scheduled, failed, recs] = await Promise.all([
    db.socialChannel.findMany({ where: { workspaceId: wsId }, orderBy: { platform: "asc" } }),
    db.post.findMany({
      where: { workspaceId: wsId, status: { in: ["scheduled", "approved"] }, scheduledAt: { not: null } },
      orderBy: { scheduledAt: "asc" },
      include: { channels: true },
    }),
    db.post.findMany({
      where: { workspaceId: wsId, status: "failed" },
      include: { channels: true },
      orderBy: { updatedAt: "desc" },
    }),
    recommendTimes(wsId, ctx.user.timezone || "UTC"),
  ]);

  const slots = await db.queueSlot.findMany({ where: { workspaceId: wsId } });

  // Scheduler heartbeat (written by every runScheduledWork tick): if nothing
  // has ticked recently, scheduled posts are sitting still — QueueView shows
  // a banner instead of letting the user assume a delay.
  let schedulerLastRun: string | null = null;
  try {
    const row = await db.systemSetting.findUnique({ where: { key: "tick_last_run" } });
    if (row) schedulerLastRun = JSON.parse(row.value) as string;
  } catch {
    /* missing key or bad value = never ran */
  }
  const schedulerStale =
    !schedulerLastRun || Date.now() - new Date(schedulerLastRun).getTime() > 20 * 60_000;

  return (
    <QueueView
      canEdit={can(ctx.active.role, "content.publish")}
      schedulerStale={schedulerStale}
      schedulerLastRun={schedulerLastRun}
      channels={channels.map((c) => ({
        id: c.id,
        name: c.name,
        platform: c.platform,
        paused: c.queuePaused,
        slotCount: slots.filter((s) => s.channelId === c.id).length,
      }))}
      scheduled={scheduled.map((p) => ({
        id: p.id,
        title: p.title ?? p.channels[0]?.body?.slice(0, 50) ?? "Untitled",
        when: p.scheduledAt!.toISOString(),
        status: p.status,
        channelIds: p.channels.map((c) => c.channelId),
        platforms: p.channels.map((c) => c.platform),
      }))}
      failed={failed.map((p) => ({
        id: p.id,
        title: p.title ?? p.channels[0]?.body?.slice(0, 50) ?? "Untitled",
        error: p.channels.find((c) => c.error)?.error ?? "Publishing failed",
      }))}
      recommendation={recs}
    />
  );
}
