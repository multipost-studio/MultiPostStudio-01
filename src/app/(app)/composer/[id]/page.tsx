import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseJson } from "@/lib/utils";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Composer" };

export default async function ComposerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;

  const post = await db.post.findFirst({
    where: { id, workspaceId: wsId },
    include: {
      channels: true,
      media: { include: { media: true }, orderBy: { order: "asc" } },
      tags: true,
      prediction: true,
      versions: { orderBy: { version: "desc" }, include: { author: { select: { name: true } } } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
      approvalRequests: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { flow: { include: { stages: { orderBy: { order: "asc" } } } } },
      },
    },
  });
  if (!post) notFound();

  const [channels, campaigns, pillars, tags, media] = await Promise.all([
    db.socialChannel.findMany({ where: { workspaceId: wsId }, orderBy: { platform: "asc" } }),
    db.campaign.findMany({ where: { workspaceId: wsId }, orderBy: { name: "asc" } }),
    db.contentPillar.findMany({ where: { workspaceId: wsId } }),
    db.tag.findMany({ where: { workspaceId: wsId }, orderBy: { name: "asc" } }),
    db.mediaAsset.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "desc" }, take: 60 }),
  ]);

  return (
    <Composer
      canPublish={can(ctx.active.role, "content.publish")}
      canApprove={can(ctx.active.role, "content.approve")}
      post={{
        id: post.id,
        title: post.title ?? "",
        status: post.status,
        firstComment: post.firstComment ?? "",
        campaignId: post.campaignId ?? "",
        pillarId: post.pillarId ?? "",
        utmSource: post.utmSource ?? "",
        utmMedium: post.utmMedium ?? "",
        utmCampaign: post.utmCampaign ?? "",
        isEvergreen: post.isEvergreen,
        scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
        channels: post.channels.map((c) => ({ channelId: c.channelId, platform: c.platform, body: c.body, error: c.error, publishedUrl: c.publishedUrl })),
        mediaIds: post.media.map((m) => m.mediaId),
        tagIds: post.tags.map((t) => t.tagId),
        prediction: post.prediction
          ? {
              engagementScore: post.prediction.engagementScore,
              clarityScore: post.prediction.clarityScore,
              hookStrength: post.prediction.hookStrength,
              readability: post.prediction.readability,
              ctaScore: post.prediction.ctaScore,
              brandVoiceScore: post.prediction.brandVoiceScore,
              platformFitScore: post.prediction.platformFitScore,
              recommendations: parseJson<string[]>(post.prediction.recommendations, []),
              actualEngagementRate: post.prediction.actualEngagementRate,
            }
          : null,
        versions: post.versions.map((v) => ({ id: v.id, version: v.version, note: v.note, author: v.author.name, createdAt: v.createdAt.toISOString() })),
        comments: post.comments.map((c) => ({ id: c.id, body: c.body, author: c.author.name, resolved: c.resolved, createdAt: c.createdAt.toISOString() })),
        approval: post.approvalRequests[0]
          ? {
              id: post.approvalRequests[0].id,
              status: post.approvalRequests[0].status,
              currentStage: post.approvalRequests[0].currentStage,
              stages: post.approvalRequests[0].flow.stages.map((s) => s.name),
            }
          : null,
      }}
      channels={channels.map((c) => ({ id: c.id, platform: c.platform, name: c.name, handle: c.handle }))}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      pillars={pillars.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
      tags={tags.map((t) => ({ id: t.id, name: t.name }))}
      media={media.map((m) => ({ id: m.id, url: m.url, thumbUrl: m.thumbUrl, kind: m.kind, filename: m.filename, altText: m.altText ?? "" }))}
    />
  );
}
