import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { apiOk, apiError } from "@/lib/api/respond";

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
  // An unparseable date throws RangeError at .toISOString() below (500).
  // Reject it as a 400 instead of letting it become an error oracle.
  if (isNaN(+since)) return apiError(400, "Invalid since parameter");

  const where = {
    capturedAt: { gte: since },
    post: { workspace: { orgId: ctx.orgId }, ...(workspaceId ? { workspaceId } : {}) },
  };

  const [agg, count] = await Promise.all([
    db.postMetric.aggregate({
      where,
      _sum: {
        impressions: true,
        reach: true,
        likes: true,
        comments: true,
        shares: true,
        saves: true,
        clicks: true,
      },
      _avg: {
        engagementRate: true,
      },
    }),
    db.postMetric.count({ where }),
  ]);

  return apiOk({
    since: since.toISOString(),
    postsWithMetrics: count,
    totals: {
      impressions: agg._sum.impressions ?? 0,
      reach: agg._sum.reach ?? 0,
      likes: agg._sum.likes ?? 0,
      comments: agg._sum.comments ?? 0,
      shares: agg._sum.shares ?? 0,
      saves: agg._sum.saves ?? 0,
      clicks: agg._sum.clicks ?? 0,
    },
    avgEngagementRate: Number((agg._avg.engagementRate ?? 0).toFixed(2)),
  });
});
