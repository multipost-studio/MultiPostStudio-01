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
    recommendTimes(wsId),
  ]);

  const slots = await db.queueSlot.findMany({ where: { workspaceId: wsId } });

  return (
    <QueueView
      canEdit={can(ctx.active.role, "content.publish")}
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
