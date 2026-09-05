import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/session";
import { getAnalytics, type Range } from "@/lib/analytics";
import { hasEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";

const RANGES: Range[] = [7, 14, 30, 90];

function csv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export async function GET(req: NextRequest) {
  const ctx = await requireWorkspace();
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
  const days = (RANGES.includes(Number(url.searchParams.get("range")) as Range)
    ? Number(url.searchParams.get("range"))
    : 30) as Range;
  const dataset = url.searchParams.get("dataset") ?? "posts";

  const a = await getAnalytics(ctx.active.workspace.id, days);

  let header: string[];
  let body: (string | number)[][];
  let name: string;

  if (dataset === "series") {
    header = ["date", "followers", "reach", "impressions", "engagement"];
    body = a.series.map((s) => [s.label, s.followers, s.reach, s.impressions, s.engagement]);
    name = `analytics-timeseries-${days}d`;
  } else if (dataset === "hashtags") {
    header = ["hashtag", "posts", "impressions", "engagement", "avg_engagement_rate_pct"];
    body = a.byHashtag.map((h) => [h.name, h.posts, h.impressions, h.engagement, h.avgEngagementRate.toFixed(2)]);
    name = `analytics-hashtags-${days}d`;
  } else if (dataset === "formats") {
    header = ["format", "posts", "impressions", "engagement", "avg_engagement_rate_pct"];
    body = a.byFormat.map((f) => [f.format, f.posts, f.impressions, f.engagement, f.avgEngagementRate.toFixed(2)]);
    name = `analytics-formats-${days}d`;
  } else {
    header = ["post_id", "title", "platform", "format", "pillar", "campaign", "published_at", "impressions", "engagement", "saves", "clicks", "engagement_rate_pct"];
    body = [...a.topPosts, ...a.worstPosts]
      .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
      .map((p) => [
        p.id, p.title, p.platform, p.format, p.pillar, p.campaign ?? "", p.publishedAt,
        p.impressions, p.engagement, p.saves, p.clicks, p.engagementRate.toFixed(2),
      ]);
    name = `analytics-posts-${days}d`;
  }

  const out = csv([header, ...body]);
  return new NextResponse(out, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
