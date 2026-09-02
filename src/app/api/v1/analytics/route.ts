import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";

export const runtime = "nodejs";

/**
 * GET /api/v1/analytics — aggregate post metrics for the org.
 * Query: ?workspaceId= ?since=ISO (default 30d)
 * Scope: analytics:read
 */
export const GET = apiRoute("analytics:read", async (req, ctx) => {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 30 * 86_400_000);

  const metrics = await db.postMetric.findMany({
    where: {
      capturedAt: { gte: since },
      post: { workspace: { orgId: ctx.orgId }, ...(workspaceId ? { workspaceId } : {}) },
    },
    select: {
      impressions: true,
      reach: true,
      likes: true,
      comments: true,
      shares: true,
      saves: true,
      clicks: true,
      engagementRate: true,
    },
  });

  const sum = (k: keyof (typeof metrics)[number]) => metrics.reduce((s, m) => s + (m[k] as number), 0);
  const n = metrics.length || 1;

  return apiOk({
    since: since.toISOString(),
    postsWithMetrics: metrics.length,
    totals: {
      impressions: sum("impressions"),
      reach: sum("reach"),
      likes: sum("likes"),
      comments: sum("comments"),
      shares: sum("shares"),
      saves: sum("saves"),
      clicks: sum("clicks"),
    },
    avgEngagementRate: Number((sum("engagementRate") / n).toFixed(2)),
  });
});
