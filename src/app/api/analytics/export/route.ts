import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/session";
import { getAnalytics } from "@/lib/analytics";
import { resolveAnalyticsRange } from "@/lib/analytics-range";
import { hasEntitlement } from "@/lib/entitlements";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

function csv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    // Formula-injection guard (parity with admin/export): a cell starting
    // with = + - @ tab/CR opens as a formula in Excel/Sheets. Prefix with a
    // single quote so post titles like "=cmd|..." export as text.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export async function GET(req: NextRequest) {
  const ctx = await requireWorkspace();
  // Effective permissions, so a custom role without analytics.view cannot export what it cannot see.
  if (!ctx.active.permissions.includes("analytics.view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // 10 exports/hour/user — getAnalytics fans out to 6 queries + CSV render.
  const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit");
  try {
    await enforceRateLimit(`analytics-export:${ctx.user.id}`, 10, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": "3600" } });
    }
    throw e;
  }
  // CSV export is a paid plan feature ("export_csv"). This route is directly
  // addressable, so the check has to live here — not only on the button that
  // links to it.
  if (!(await hasEntitlement(ctx.active.org.id, "export_csv"))) {
    return NextResponse.json(
      { error: "CSV export isn't included in your current plan." },
      { status: 403 },
    );
  }
  const url = new URL(req.url);
  const rr = resolveAnalyticsRange({ range: url.searchParams.get("range") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  const dataset = url.searchParams.get("dataset") ?? "posts";

  try {
    const a = await getAnalytics(ctx.active.workspace.id, rr.days, ctx.user.timezone || "UTC", rr.window);

    let header: string[];
    let body: (string | number)[][];
    let name: string;

    if (dataset === "series") {
      header = ["date", "followers", "reach", "impressions", "engagement"];
      body = a.series.map((s) => [s.label, s.followers, s.reach, s.impressions, s.engagement]);
      name = `analytics-timeseries-${rr.custom ? `${rr.custom.from}_to_${rr.custom.to}` : `${a.days}d`}`;
    } else if (dataset === "hashtags") {
      header = ["hashtag", "posts", "impressions", "engagement", "avg_engagement_rate_pct"];
      body = a.byHashtag.map((h) => [h.name, h.posts, h.impressions, h.engagement, h.avgEngagementRate.toFixed(2)]);
      name = `analytics-hashtags-${rr.custom ? `${rr.custom.from}_to_${rr.custom.to}` : `${a.days}d`}`;
    } else if (dataset === "formats") {
      header = ["format", "posts", "impressions", "engagement", "avg_engagement_rate_pct"];
      body = a.byFormat.map((f) => [f.format, f.posts, f.impressions, f.engagement, f.avgEngagementRate.toFixed(2)]);
      name = `analytics-formats-${rr.custom ? `${rr.custom.from}_to_${rr.custom.to}` : `${a.days}d`}`;
    } else {
      header = ["post_id", "title", "platform", "format", "pillar", "campaign", "published_at", "impressions", "engagement", "saves", "clicks", "engagement_rate_pct"];
      // Full post history for the range — previously this exported only the
      // top-5 + worst-5 highlight rows while the filename promised everything.
      body = [...a.allPosts]
        .sort((x, y) => (x.publishedAt < y.publishedAt ? 1 : -1))
        .map((p) => [
          p.id, p.title, p.platform, p.format, p.pillar, p.campaign ?? "", p.publishedAt,
          p.impressions, p.engagement, p.saves, p.clicks, p.engagementRate.toFixed(2),
        ]);
      name = `analytics-posts-${rr.custom ? `${rr.custom.from}_to_${rr.custom.to}` : `${a.days}d`}`;
    }

    const out = csv([header, ...body]);
    return new NextResponse(out, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}.csv"`,
      },
    });
  } catch (e) {
    logger.error({ err: e, workspaceId: ctx.active.workspace.id, dataset }, "analytics export failed");
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
