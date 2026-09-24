import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { apiOk, apiError, pagination, keyset } from "@/lib/api/respond";
import { enqueuePublish } from "@/lib/adapters/queue";
import { dispatchWebhook } from "@/lib/adapters/webhooks";
import { bumpUsage } from "@/lib/adapters/billing";
import { planLimit } from "@/lib/entitlements";
import { PLATFORMS, type PlatformKey } from "@/lib/constants";

export const runtime = "nodejs";

const POST_STATUSES = ["draft", "scheduled", "published", "failed", "awaiting_approval", "approved", "archived"];

/**
 * GET /api/v1/posts — list posts across the org.
 * Query: ?workspaceId= ?status= ?page= ?limit= (?cursor= for keyset)
 * Scope: posts:read. Cursor mode (?cursor=<id>) is stable under concurrent
 * inserts and avoids deep-offset scans; offset mode stays for compatibility.
 */
export const GET = apiRoute("posts:read", async (req, ctx) => {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  if (status && !POST_STATUSES.includes(status)) return apiError(400, `Unknown status: ${status}`);

  const where = {
    workspace: { orgId: ctx.orgId },
    ...(workspaceId ? { workspaceId } : {}),
    ...(status ? { status } : {}),
  };

  const { cursor } = keyset(url);
  if (cursor) {
    const { limit } = keyset(url);
    const rows = await db.post.findMany({
      where: { ...where, id: { lt: cursor } },
      take: limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { channels: { select: { platform: true, body: true, status: true, publishedUrl: true } } },
    });
    const data = rows.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      title: p.title,
      status: p.status,
      scheduledAt: p.scheduledAt,
      publishedAt: p.publishedAt,
      channels: p.channels,
    }));
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    const { NextResponse: NR } = await import("next/server");
    return NR.json({ success: true, data, error: null, meta: { total: -1, page: 1, limit, nextCursor } });
  }

  const { page, limit, skip } = pagination(url);
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
  workspaceId: z.string().min(1).max(100),
  title: z.string().max(200).optional(),
  scheduledAt: z.string().datetime().optional(),
  channels: z
    .array(
      z.object({
        channelId: z.string().min(1).max(100),
        body: z.string().min(1).max(200000),
        firstComment: z.string().max(2000).optional(),
      }),
    )
    .min(1)
    .max(10),
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

  const idemHeader = req.headers.get("idempotency-key")?.trim().slice(0, 100) ?? null;

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

  // Same plan cap the composer enforces (limitGuard(..., "maxScheduled", ...)
  // in actions/posts.ts) — without it this API is an unmetered bypass of the
  // scheduled-posts limit.
  if (when) {
    const queued = await db.post.count({ where: { workspace: { orgId: ctx.orgId }, status: "scheduled" } });
    const limit = await planLimit(ctx.orgId, "maxScheduled");
    if (limit > 0 && queued >= limit) {
      return apiError(403, `Your plan allows ${limit} scheduled posts. You're at ${queued}.`);
    }
  }

  // API keys are org-scoped, not user-scoped — attribute to an org owner.
  const owner = await db.membership.findFirst({
    where: { orgId: ctx.orgId, role: { in: ["owner", "admin"] }, status: "active" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return apiError(409, "Org has no owner/admin to attribute the post to");

  // Claim idempotency AFTER validation so bad requests don't burn the key.
  // Retries with the same Idempotency-Key header get a 409 instead of a duplicate post.
  if (idemHeader) {
    const { claimIdempotencyKey } = await import("@/lib/idempotency");
    if (!(await claimIdempotencyKey(`v1-post:${ctx.keyId}:${idemHeader}`, "v1-post"))) {
      return apiError(409, "Duplicate request — this Idempotency-Key was already used");
    }
  }

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
    await bumpUsage(ctx.orgId, "scheduled_posts");
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
