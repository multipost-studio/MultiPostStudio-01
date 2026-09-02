import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { apiOk, apiError } from "@/lib/api/respond";

export const runtime = "nodejs";

/** GET /api/v1/posts/:id — one post with channels + metrics. Scope: posts:read */
export const GET = apiRoute("posts:read", async (_req, ctx, params) => {
  const post = await db.post.findFirst({
    where: { id: params.id, workspace: { orgId: ctx.orgId } },
    include: {
      channels: {
        select: { platform: true, body: true, status: true, publishedUrl: true, remoteId: true, error: true },
      },
      metrics: {
        select: { impressions: true, likes: true, comments: true, shares: true, clicks: true, engagementRate: true },
      },
    },
  });
  if (!post) return apiError(404, "Post not found");

  return apiOk({
    id: post.id,
    workspaceId: post.workspaceId,
    title: post.title,
    status: post.status,
    scheduledAt: post.scheduledAt,
    publishedAt: post.publishedAt,
    firstComment: post.firstComment,
    channels: post.channels,
    metrics: post.metrics,
  });
});
