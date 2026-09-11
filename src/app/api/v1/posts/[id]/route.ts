import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { apiOk, apiError } from "@/lib/api/respond";
import { cancelPublish, enqueuePublish } from "@/lib/adapters/queue";
import { dispatchWebhook } from "@/lib/adapters/webhooks";

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

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

/**
 * PATCH /api/v1/posts/:id — reschedule, unschedule (scheduledAt: null), or
 * rename a draft/scheduled post. Scope: posts:write
 *
 * Mirrors the composer's own rules (actions/posts.ts): a live or in-flight
 * post can't be edited through the side door this endpoint would otherwise
 * be, and moving scheduledAt re-queues the publish job rather than leaving a
 * stale one pointed at the old time.
 */
export const PATCH = apiRoute("posts:write", async (req, ctx, params) => {
  const post = await db.post.findFirst({ where: { id: params.id, workspace: { orgId: ctx.orgId } } });
  if (!post) return apiError(404, "Post not found");
  if (["published", "publishing"].includes(post.status)) return apiError(409, "Published posts can't be edited");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "Body must be valid JSON");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const input = parsed.data;
  if (input.title === undefined && input.scheduledAt === undefined) {
    return apiError(400, "Nothing to update");
  }

  let when: Date | null | undefined;
  if (input.scheduledAt !== undefined) {
    when = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (when && when.getTime() < Date.now() - 60_000) return apiError(400, "scheduledAt must be in the future");
  }

  const updated = await db.post.update({
    where: { id: post.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(when !== undefined ? { scheduledAt: when, status: when ? "scheduled" : "draft" } : {}),
    },
  });

  if (when !== undefined) {
    await cancelPublish(post.id);
    if (when) {
      await enqueuePublish(post.id, when);
      await dispatchWebhook(ctx.orgId, "post.scheduled", { postId: post.id, scheduledAt: when.toISOString() });
    }
  }

  return apiOk({ id: updated.id, title: updated.title, status: updated.status, scheduledAt: updated.scheduledAt });
});

/**
 * DELETE /api/v1/posts/:id — delete a draft/scheduled post. Scope: posts:write
 * A live or in-flight post must go through the app (retract/cancel flows),
 * not vanish out from under an in-progress publish.
 */
export const DELETE = apiRoute("posts:write", async (_req, ctx, params) => {
  const post = await db.post.findFirst({ where: { id: params.id, workspace: { orgId: ctx.orgId } } });
  if (!post) return apiError(404, "Post not found");
  if (["published", "publishing"].includes(post.status)) return apiError(409, "Published posts can't be deleted");

  await cancelPublish(post.id);
  await db.post.delete({ where: { id: post.id } });
  return apiOk({ id: post.id, deleted: true });
});
