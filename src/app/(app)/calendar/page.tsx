import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { recommendTimes } from "@/lib/scheduling";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;

  const from = new Date();
  from.setMonth(from.getMonth() - 1, 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setMonth(to.getMonth() + 2, 0);

  const [posts, channels, campaigns, pillars, recs] = await Promise.all([
    db.post.findMany({
      where: {
        workspaceId: wsId,
        status: { in: ["scheduled", "approved", "awaiting_approval", "published", "failed"] },
        OR: [
          { scheduledAt: { gte: from, lte: to } },
          { publishedAt: { gte: from, lte: to } },
        ],
      },
      include: { channels: { include: { channel: true } } },
    }),
    db.socialChannel.findMany({ where: { workspaceId: wsId } }),
    db.campaign.findMany({ where: { workspaceId: wsId } }),
    db.contentPillar.findMany({ where: { workspaceId: wsId } }),
    recommendTimes(wsId),
  ]);

  return (
    <CalendarView
      canEdit={can(ctx.active.role, "content.publish")}
      posts={posts.map((p) => ({
        id: p.id,
        title: p.title ?? p.channels[0]?.body?.slice(0, 40) ?? "Untitled",
        status: p.status,
        campaignId: p.campaignId,
        pillarId: p.pillarId,
        when: (p.scheduledAt ?? p.publishedAt ?? p.updatedAt).toISOString(),
        platforms: p.channels.map((c) => c.platform),
        channelIds: p.channels.map((c) => c.channelId),
      }))}
      channels={channels.map((c) => ({ id: c.id, name: c.name, platform: c.platform }))}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      pillars={pillars.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
      bestTimes={{ bestWeekday: recs.bestWeekday, bestHour: recs.bestHour, note: recs.note }}
    />
  );
}
