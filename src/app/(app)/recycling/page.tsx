import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { RecycNewRule, RecycRuleRow, RecycMarkEvergreen } from "./recycling-client";

export const metadata: Metadata = { title: "Content Recycling" };

export default async function RecyclingPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;

  const [rules, evergreen, candidates] = await Promise.all([
    db.recycleRule.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { posts: true } } } }),
    db.post.findMany({
      where: { workspaceId: wsId, isEvergreen: true, status: "published" },
      include: { channels: true, recycleRule: true, metrics: true },
      orderBy: { publishedAt: "desc" },
    }),
    // Top performers not yet evergreen — "worth repurposing"
    db.post.findMany({
      where: { workspaceId: wsId, status: "published", isEvergreen: false },
      include: { channels: true, metrics: true },
      take: 20,
    }),
  ]);

  const scored = candidates
    .map((p) => {
      const rate =
        p.metrics.length > 0
          ? p.metrics.reduce((s, m) => s + m.engagementRate, 0) / p.metrics.length
          : 0;
      return { p, rate };
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Content Recycling"
        description="Rules-based reposting of evergreen content with frequency caps, so nothing feels repetitive."
        actions={<RecycNewRule />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recycling rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rules.length === 0 ? (
              <p className="text-[14px] text-[var(--text-muted)]">No rules yet — create one to start recycling.</p>
            ) : (
              rules.map((r) => (
                <div key={r.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[14px] font-semibold text-[var(--text)]">{r.name}</p>
                    <RecycRuleRow id={r.id} enabled={r.enabled} />
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
                    Every {r.frequencyDays}d · max {r.maxReposts} reposts · ≥{r.minGapDays}d gap · {r._count.posts} posts
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI: worth repurposing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {scored.length === 0 ? (
              <p className="text-[14px] text-[var(--text-muted)]">Publish more posts to get recommendations.</p>
            ) : (
              scored.map(({ p, rate }) => (
                <div key={p.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5">
                  <PlatformBadge platform={p.channels[0]?.platform ?? "x"} size={16} />
                  <Link href={`/composer/${p.id}`} className="flex-1 truncate text-[14px] text-[var(--text)] hover:underline">
                    {p.title ?? p.channels[0]?.body?.slice(0, 40) ?? "Untitled"}
                  </Link>
                  <span className="text-[13px] font-semibold text-[var(--success)]">{rate.toFixed(1)}%</span>
                  <RecycMarkEvergreen postId={p.id} rules={rules.map((r) => ({ id: r.id, name: r.name }))} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Evergreen library ({evergreen.length})</h2>
        {evergreen.length === 0 ? (
          <EmptyState title="No evergreen content yet" description="Mark high-performing posts as evergreen from the composer or here." />
        ) : (
          <div className="space-y-2">
            {evergreen.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
                <PlatformBadge platform={p.channels[0]?.platform ?? "x"} size={18} />
                <Link href={`/composer/${p.id}`} className="flex-1 truncate text-[14px] text-[var(--text)] hover:underline">
                  {p.title ?? p.channels[0]?.body?.slice(0, 50) ?? "Untitled"}
                </Link>
                {p.recycleRule ? (
                  <Badge tone="primary">{p.recycleRule.name}</Badge>
                ) : (
                  <Badge tone="neutral">No rule</Badge>
                )}
                <RecycMarkEvergreen postId={p.id} rules={rules.map((r) => ({ id: r.id, name: r.name }))} attached={p.recycleRuleId} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
