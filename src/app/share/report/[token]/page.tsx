import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAnalytics, type Range } from "@/lib/analytics";
import { parseJson, formatNumber, formatDate } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, InlineEmpty } from "@/components/ui/misc";
import { TrendArea } from "@/components/charts";

/**
 * Public, read-only report.
 *
 * /reports offers "Copy share link" pointing here, but the route did not
 * exist — every shared link 404'd.
 *
 * Authorization is the share token itself: `rpt_` + 20 hex chars (80 bits),
 * unique in the DB, and set to null when sharing is disabled, so revoking a
 * link takes effect immediately. The workspace is resolved FROM the token —
 * never from the URL — so a token cannot be pointed at another workspace.
 */

type ReportConfig = {
  dateRange: string;
  widgets: string[];
  branding?: { logo?: boolean };
};

const RANGE_DAYS: Record<string, Range> = {
  last_7_days: 7,
  last_30_days: 30,
  last_90_days: 90,
  // "this month" has no fixed length; 30d is the closest supported window and
  // the header states the actual range so the number is never misrepresented.
  this_month: 30,
};

const RANGE_LABEL: Record<string, string> = {
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_month: "This month (last 30 days)",
};

async function loadShared(token: string) {
  // Reject anything that isn't a plausible token before touching the DB.
  if (!/^rpt_[a-f0-9]{10,64}$/.test(token)) return null;
  const report = await db.report.findUnique({
    where: { shareToken: token },
    select: {
      name: true,
      config: true,
      lastRunAt: true,
      workspace: { select: { id: true, name: true } },
    },
  });
  return report ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const report = await loadShared(token);
  return {
    title: report ? `${report.name} · ${report.workspace.name}` : "Report",
    // A shared link should never be indexed — it is unlisted, not public.
    robots: { index: false, follow: false },
  };
}

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await loadShared(token);
  // Unknown, malformed or revoked token — indistinguishable to the caller, so
  // a probe cannot tell a real-but-revoked token from one that never existed.
  if (!report) notFound();

  const cfg = parseJson<ReportConfig>(report.config, { dateRange: "last_30_days", widgets: [] });
  const days = RANGE_DAYS[cfg.dateRange] ?? 30;
  const a = await getAnalytics(report.workspace.id, days);
  const show = (w: string) => cfg.widgets.includes(w);

  return (
    <main className="min-h-screen bg-[var(--bg)] px-5 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-6">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight text-[var(--text)]">{report.name}</h1>
            <p className="mt-1 text-[14px] text-[var(--text-muted)]">
              {report.workspace.name} · {RANGE_LABEL[cfg.dateRange] ?? `Last ${days} days`}
              {report.lastRunAt ? ` · updated ${formatDate(report.lastRunAt)}` : ""}
            </p>
          </div>
          {/* White-label: the logo is shown only when branding is enabled. */}
          {cfg.branding?.logo !== false && <Logo />}
        </header>

        {cfg.widgets.length === 0 ? (
          <InlineEmpty
            title="This report has no widgets yet"
            hint="Whoever shared this link can add analytics widgets to it from their reports page."
          />
        ) : (
          <div className="space-y-6">
            {(show("followers_growth") || show("reach_impressions") || show("engagement_rate")) && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {show("followers_growth") && (
                  <Stat label="Followers" value={formatNumber(a.totals.followers)} delta={a.deltas.followerGrowth} />
                )}
                {show("reach_impressions") && (
                  <>
                    <Stat label="Reach" value={formatNumber(a.totals.reach)} delta={a.deltas.reach} />
                    <Stat label="Impressions" value={formatNumber(a.totals.impressions)} delta={a.deltas.impressions} />
                  </>
                )}
                {show("engagement_rate") && (
                  <Stat label="Engagement rate" value={`${a.engagementRate.toFixed(1)}%`} />
                )}
              </div>
            )}

            {show("followers_growth") && (
              <Card>
                <CardHeader>
                  <CardTitle>Follower growth</CardTitle>
                </CardHeader>
                <CardContent>
                  {a.series.length > 0 ? (
                    <TrendArea data={a.series} dataKey="followers" />
                  ) : (
                    <InlineEmpty title="No follower history in this range" />
                  )}
                </CardContent>
              </Card>
            )}

            {show("posting_frequency") && (
              <Card>
                <CardHeader>
                  <CardTitle>Posting frequency</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[14px] text-[var(--text-muted)]">
                    <span className="text-[19px] font-semibold text-[var(--text)]">{a.postCount}</span> posts
                    published in the last {days} days.
                  </p>
                </CardContent>
              </Card>
            )}

            {show("top_posts") && <PostTable title="Top posts" rows={a.topPosts} />}
            {show("worst_posts") && <PostTable title="Underperforming posts" rows={a.worstPosts} />}

            {show("engagement_by_format") && (
              <BreakdownTable
                title="Engagement by format"
                label="Format"
                rows={a.byFormat.map((f) => ({ name: f.format, posts: f.posts, rate: f.avgEngagementRate }))}
              />
            )}
            {show("platform_comparison") && (
              <BreakdownTable
                title="Platform comparison"
                label="Platform"
                rows={a.byPlatform.map((p) => ({ name: p.platform, posts: p.posts, rate: p.avgEngagementRate }))}
              />
            )}
            {show("campaign_performance") && (
              <CampaignTable rows={a.byCampaign.map((c) => ({ name: c.name, posts: c.posts, engagement: c.engagement }))} />
            )}
          </div>
        )}

        <footer className="mt-10 border-t border-[var(--border)] pt-5 text-[12px] text-[var(--text-subtle)]">
          Shared report · read-only. Figures cover the period stated above.
        </footer>
      </div>
    </main>
  );
}

/** Post rows carry no internal ids — a shared link exposes numbers, not records. */
function PostTable({
  title,
  rows,
}: {
  title: string;
  rows: { title: string; platform: string; engagement: number; engagementRate: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <InlineEmpty title="Nothing published in this range" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 text-left font-semibold text-[var(--text-subtle)]">Post</th>
                  <th className="py-2 text-left font-semibold text-[var(--text-subtle)]">Platform</th>
                  <th className="py-2 text-right font-semibold text-[var(--text-subtle)]">Engagement</th>
                  <th className="py-2 text-right font-semibold text-[var(--text-subtle)]">Rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((p, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3 text-[var(--text)]">{p.title}</td>
                    <td className="py-2 pr-3 capitalize text-[var(--text-muted)]">{p.platform}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text)]">{formatNumber(p.engagement)}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text-muted)]">
                      {p.engagementRate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Campaigns report total engagement, not an average rate — analytics does not
 *  compute a per-campaign rate, and inventing one here would misreport it. */
function CampaignTable({ rows }: { rows: { name: string; posts: number; engagement: number }[] }) {
  const withData = rows.filter((r) => r.posts > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign performance</CardTitle>
      </CardHeader>
      <CardContent>
        {withData.length === 0 ? (
          <InlineEmpty title="No campaign activity in this range" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 text-left font-semibold text-[var(--text-subtle)]">Campaign</th>
                  <th className="py-2 text-right font-semibold text-[var(--text-subtle)]">Posts</th>
                  <th className="py-2 text-right font-semibold text-[var(--text-subtle)]">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {withData.map((r) => (
                  <tr key={r.name} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3 text-[var(--text)]">{r.name}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text-muted)]">{r.posts}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text)]">{formatNumber(r.engagement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownTable({
  title,
  label,
  rows,
}: {
  title: string;
  label: string;
  rows: { name: string; posts: number; rate: number }[];
}) {
  const withData = rows.filter((r) => r.posts > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {withData.length === 0 ? (
          <InlineEmpty title="Not enough published posts in this range" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 text-left font-semibold text-[var(--text-subtle)]">{label}</th>
                  <th className="py-2 text-right font-semibold text-[var(--text-subtle)]">Posts</th>
                  <th className="py-2 text-right font-semibold text-[var(--text-subtle)]">Avg. eng. rate</th>
                </tr>
              </thead>
              <tbody>
                {withData.map((r) => (
                  <tr key={r.name} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3 capitalize text-[var(--text)]">{r.name}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text-muted)]">{r.posts}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text)]">{r.rate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
