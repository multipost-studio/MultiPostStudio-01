import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { formatNumber, relativeTime } from "@/lib/utils";
import { CompAdd, CompRemove } from "./controls";

export const metadata: Metadata = { title: "Competitors" };

export default async function CompetitorsPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;
  const [competitors, channels, a] = await Promise.all([
    db.competitor.findMany({
      where: { workspaceId: wsId },
      include: { posts: { orderBy: { postedAt: "desc" }, take: 4 } },
      orderBy: { followerCount: "desc" },
    }),
    db.socialChannel.findMany({ where: { workspaceId: wsId }, select: { followerCount: true } }),
    getAnalytics(wsId, 30),
  ]);

  const myFollowers = channels.reduce((n, c) => n + c.followerCount, 0);
  const myEr = a.engagementRate;
  const myPostsPerWeek = a.postCount / (30 / 7);
  const avg = (k: "followerCount" | "avgEngagement" | "postsPerWeek") =>
    competitors.length ? competitors.reduce((n, c) => n + c[k], 0) / competitors.length : 0;
  const rankFollowers = competitors.filter((c) => c.followerCount > myFollowers).length + 1;

  const cmp = (mine: number, theirs: number) => {
    if (theirs === 0) return null;
    const pct = ((mine - theirs) / theirs) * 100;
    return { ahead: pct >= 0, pct: Math.abs(pct) };
  };

  return (
    <>
      <PageHeader
        title="Competitor Intelligence"
        description="Track public competitors' cadence, formats and engagement. Only public data, within platform terms."
        actions={<CompAdd />}
      />

      {competitors.length === 0 ? (
        <EmptyState
          title="No competitors tracked"
          description="Add a public account to monitor their posting frequency and top content."
          action={<CompAdd />}
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>You vs the set ({competitors.length})</CardTitle>
              <span className="text-[13px] text-[var(--text-muted)]">
                Rank #{rankFollowers} of {competitors.length + 1} by followers
              </span>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Followers", myFollowers, avg("followerCount"), false] as const,
                  ["Posts / week", myPostsPerWeek, avg("postsPerWeek"), false] as const,
                  ["Engagement rate", myEr, avg("avgEngagement"), true] as const,
                ].map(([label, mine, theirAvg, isPct]) => {
                  const d = cmp(mine, theirAvg);
                  return (
                    <div key={label} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                      <p className="text-[12px] uppercase tracking-wide text-[var(--text-subtle)]">{label}</p>
                      <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-[var(--text)]">
                        {isPct ? `${mine.toFixed(1)}%` : formatNumber(Math.round(mine))}
                      </p>
                      <p className="text-[12px] text-[var(--text-subtle)]">
                        set avg {isPct ? `${theirAvg.toFixed(1)}%` : formatNumber(Math.round(theirAvg))}
                        {d && (
                          <span className={d.ahead ? " text-[var(--success)]" : " text-[var(--danger)]"}>
                            {" "}· {d.ahead ? "▲" : "▼"} {d.pct.toFixed(0)}%
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {competitors.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={c.platform} size={22} />
                  <div>
                    <CardTitle>{c.name}</CardTitle>
                    <p className="text-[13px] text-[var(--text-subtle)]">{c.handle}</p>
                  </div>
                </div>
                <CompRemove id={c.id} />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 border-b border-[var(--border)] pb-3">
                  {([
                    ["Followers", c.followerCount, myFollowers, false] as const,
                    ["Posts / week", c.postsPerWeek, myPostsPerWeek, false] as const,
                    ["Avg engagement", c.avgEngagement, myEr, true] as const,
                  ]).map(([label, val, mine, isPct]) => {
                    const d = cmp(mine, val);
                    return (
                      <div key={label}>
                        <p className="text-[12px] uppercase text-[var(--text-subtle)]">{label}</p>
                        <p className="text-lg font-semibold tabular-nums text-[var(--text)]">
                          {isPct ? `${val}%` : formatNumber(val)}
                        </p>
                        {d && (
                          <p className={`text-[11px] ${d.ahead ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                            you {d.ahead ? "+" : "−"}{d.pct.toFixed(0)}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {c.aiSummary && (
                  <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--primary-soft)]/40 p-3 text-[14px] text-[var(--text-muted)]">
                    <span className="font-medium text-[var(--primary)]">AI summary: </span>
                    {c.aiSummary}
                  </p>
                )}
                <div className="mt-3">
                  <p className="mb-1.5 text-[13px] font-semibold text-[var(--text-muted)]">Recent top posts</p>
                  <div className="space-y-1.5">
                    {c.posts.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-[13px]">
                        <Badge tone="neutral">{p.format}</Badge>
                        <span className="flex-1 truncate text-[var(--text)]">{p.caption}</span>
                        <span className="tabular-nums text-[var(--text-muted)]">{formatNumber(p.engagement)}</span>
                        <span className="text-[var(--text-subtle)]">{relativeTime(p.postedAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
