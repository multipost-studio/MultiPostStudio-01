import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
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
  const competitors = await db.competitor.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    include: { posts: { orderBy: { postedAt: "desc" }, take: 4 } },
    orderBy: { followerCount: "desc" },
  });

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
                  <div>
                    <p className="text-[12px] uppercase text-[var(--text-subtle)]">Followers</p>
                    <p className="text-lg font-semibold tabular-nums text-[var(--text)]">{formatNumber(c.followerCount)}</p>
                  </div>
                  <div>
                    <p className="text-[12px] uppercase text-[var(--text-subtle)]">Posts / week</p>
                    <p className="text-lg font-semibold tabular-nums text-[var(--text)]">{c.postsPerWeek}</p>
                  </div>
                  <div>
                    <p className="text-[12px] uppercase text-[var(--text-subtle)]">Avg engagement</p>
                    <p className="text-lg font-semibold tabular-nums text-[var(--text)]">{c.avgEngagement}%</p>
                  </div>
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
