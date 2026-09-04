import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/misc";
import { DraftFromTrendButton } from "./draft-button";
import { RefreshTrendsButton } from "./refresh-button";

export const metadata: Metadata = { title: "Trends" };

const CAT_LABEL: Record<string, string> = {
  topic: "Trending topic",
  format: "Trending format",
  keyword: "Keyword",
  industry: "Industry shift",
};

export default async function TrendsPage() {
  const ctx = await requireWorkspace();
  const trends = await db.trend.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    orderBy: { momentum: "desc" },
  });

  const opportunities = trends.filter((t) => t.suggestion).slice(0, 3);

  return (
    <>
      <PageHeader
        title="Trend Explorer"
        description="Live rising topics from Hacker News and Reddit — with content prompts."
        actions={<RefreshTrendsButton />}
      />

      {opportunities.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>3 content opportunities this week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {opportunities.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                <p className="text-[14px] text-[var(--text)]">{t.suggestion}</p>
                <DraftFromTrendButton title={t.suggestion ?? t.topic} topic={t.topic} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {trends.length === 0 ? (
        <EmptyState
          title="No trends loaded yet"
          description="Pull the latest rising topics from Hacker News and Reddit."
          action={<RefreshTrendsButton />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trends.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <Badge tone="primary">{CAT_LABEL[t.category] ?? t.category}</Badge>
                  <span className="text-[13px] font-semibold tabular-nums text-[var(--text-muted)]">{t.momentum}</span>
                </div>
                <p className="mt-2 text-[15px] font-semibold text-[var(--text)]">{t.topic}</p>
                <p className="mt-1 text-[13px] text-[var(--text-muted)]">{t.summary}</p>
                <div className="mt-3">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">Momentum</p>
                  <Progress value={t.momentum} />
                </div>
                {t.suggestion && (
                  <div className="mt-3">
                    <DraftFromTrendButton title={t.suggestion} topic={t.topic} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
