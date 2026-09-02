import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { apiOk, pagination } from "@/lib/api/respond";

export const runtime = "nodejs";

/**
 * GET /api/v1/channels — social channels across the org's workspaces.
 * Query: ?workspaceId= to filter, ?page= ?limit=.
 * Scope: channels:read
 */
export const GET = apiRoute("channels:read", async (req, ctx) => {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
  const { page, limit, skip } = pagination(url);

  const where = {
    workspace: { orgId: ctx.orgId },
    ...(workspaceId ? { workspaceId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.socialChannel.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "asc" },
      include: { socialAccount: { select: { status: true, handle: true } } },
    }),
    db.socialChannel.count({ where }),
  ]);

  const data = rows.map((c) => ({
    id: c.id,
    workspaceId: c.workspaceId,
    platform: c.platform,
    name: c.name,
    handle: c.handle,
    followerCount: c.followerCount,
    queuePaused: c.queuePaused,
    connectionStatus: c.socialAccount.status,
  }));

  return apiOk(data, { total, page, limit });
});
