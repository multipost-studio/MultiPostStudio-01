import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/misc";
import { GridPlanner } from "./grid-client";

export const metadata: Metadata = { title: "Instagram grid" };

export default async function GridPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;

  const channel = await db.socialChannel.findFirst({
    where: { workspaceId: wsId, platform: "instagram" },
    orderBy: { createdAt: "asc" },
  });

  if (!channel) {
    return (
      <>
        <PageHeader title="Instagram grid" description="Preview how your scheduled posts will land on your profile grid." />
        <EmptyState title="Connect an Instagram account first" description="This planner previews the profile feed for a connected Instagram channel." />
      </>
    );
  }

  const [published, scheduled] = await Promise.all([
    db.post.findMany({
      where: { workspaceId: wsId, status: "published", channels: { some: { channelId: channel.id } } },
      orderBy: { publishedAt: "desc" },
      take: 21,
      include: { media: { orderBy: { order: "asc" }, include: { media: true }, take: 1 } },
    }),
    db.post.findMany({
      where: { workspaceId: wsId, status: "scheduled", channels: { some: { channelId: channel.id } } },
      orderBy: { scheduledAt: "desc" },
      include: { media: { orderBy: { order: "asc" }, include: { media: true }, take: 1 } },
    }),
  ]);

  const toCell = (p: (typeof published)[number] | (typeof scheduled)[number]) => ({
    id: p.id,
    title: p.title,
    thumbUrl: p.media[0]?.media.thumbUrl ?? p.media[0]?.media.url ?? null,
  });

  return (
    <>
      <PageHeader
        title="Instagram grid"
        description={`Previewing @${channel.handle}. Scheduled posts sit above what's already live — drag to reorder them.`}
        actions={
          <Link href="/composer" className="text-[13px] text-[var(--primary)] hover:underline">
            Back to posts
          </Link>
        }
      />
      <GridPlanner
        canEdit={can(ctx.active.role, "content.publish")}
        scheduled={scheduled.map(toCell)}
        published={published.map(toCell)}
      />
    </>
  );
}
