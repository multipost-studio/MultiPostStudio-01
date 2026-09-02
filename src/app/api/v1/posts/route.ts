import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { apiOk, apiError, pagination } from "@/lib/api/respond";
import { enqueuePublish } from "@/lib/adapters/queue";
import { dispatchWebhook } from "@/lib/adapters/webhooks";
import { PLATFORMS, type PlatformKey } from "@/lib/constants";

export const runtime = "nodejs";

const POST_STATUSES = ["draft", "scheduled", "published", "failed", "awaiting_approval", "approved", "archived"];

/**
 * GET /api/v1/posts — list posts across the org.
 * Query: ?workspaceId= ?status= ?page= ?limit=
 * Scope: posts:read
 */
export const GET = apiRoute("posts:read", async (req, ctx) => {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const { page, limit, skip } = pagination(url);

  if (status && !POST_STATUSES.includes(status)) return apiError(400, `Unknown status: ${status}`);

  const where = {
    workspace: { orgId: ctx.orgId },
    ...(workspaceId ? { workspaceId } : {}),
    ...(status ? { status } : {}),
  };

  const [rows, total] = await Promise.all([
    db.post.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { channels: { select: { platform: true, body: true, status: true, publishedUrl: true } } },
    }),
    db.post.count({ where }),
  ]);

  const data = rows.map((p) => ({
    id: p.id,
    workspaceId: p.workspaceId,
    title: p.title,
    status: p.status,
    scheduledAt: p.scheduledAt,
    publishedAt: p.publishedAt,
    channels: p.channels,
  }));

  return apiOk(data, { total, page, limit });
});

const createSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().max(200).optional(),
  scheduledAt: z.string().datetime().optional(),
  channels: z
    .array(
      z.object({
        channelId: z.string().min(1),
        body: z.string().min(1),
        firstComment: z.string().optional(),
      }),
    )
    .min(1),
});

/**
 * POST /api/v1/posts — create a draft, or a scheduled post when scheduledAt is
 * given. Scope: posts:write
 */
export const POST = apiRoute("posts:write", async (req, ctx) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "Body must be valid JSON");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const input = parsed.data;

  const workspace = await db.workspace.findFirst({
    where: { id: input.workspaceId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!workspace) return apiError(404, "workspaceId not found in this org");

  const channelIds = input.channels.map((c) => c.channelId);
  const channels = await db.socialChannel.findMany({
    where: { id: { in: channelIds }, workspaceId: workspace.id },
  });
  if (channels.length !== channelIds.length) {
    return apiError(400, "One or more channelId values are not in this workspace");
  }
  const platformById = new Map(channels.map((c) => [c.id, c.platform as PlatformKey]));

  // Per-platform length check.
  for (const c of input.channels) {
    const platform = platformById.get(c.channelId)!;
    const max = PLATFORMS[platform]?.limit ?? 5000;
    if (c.body.length > max) {
      return apiError(400, `Body for ${platform} exceeds the ${max}-char limit`);
    }
  }

  const when = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (when && when.getTime() < Date.now() - 60_000) {
    return apiError(400, "scheduledAt must be in the future");
  }

  // API keys are org-scoped, not user-scoped — attribute to an org owner.
  const owner = await db.membership.findFirst({
    where: { orgId: ctx.orgId, role: { in: ["owner", "admin"] }, status: "active" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return apiError(409, "Org has no owner/admin to attribute the post to");

  const post = await db.post.create({
    data: {
      workspaceId: workspace.id,
      authorId: owner.userId,
      title: input.title ?? input.channels[0].body.split("\n")[0]?.slice(0, 80) ?? "API post",
      status: when ? "scheduled" : "draft",
      scheduledAt: when,
      firstComment: input.channels.find((c) => c.firstComment)?.firstComment ?? null,
      channels: {
        create: input.channels.map((c) => ({
          channelId: c.channelId,
          platform: platformById.get(c.channelId)!,
          body: c.body,
          status: when ? "scheduled" : "pending",
        })),
      },
    },
    include: { channels: true },
  });

  if (when) {
    await enqueuePublish(post.id, when);
    await dispatchWebhook(ctx.orgId, "post.scheduled", { postId: post.id, scheduledAt: when.toISOString() });
  }

  return apiOk(
    {
      id: post.id,
      workspaceId: post.workspaceId,
      title: post.title,
      status: post.status,
      scheduledAt: post.scheduledAt,
      channels: post.channels.map((c) => ({ platform: c.platform, body: c.body, status: c.status })),
    },
    undefined,
    { status: 201 },
  );
});
