import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { hasEntitlement } from "@/lib/entitlements";
import { UpgradeRequired } from "@/components/upgrade-required";
import { RecycNewRule, RecycRuleRow, RecycMarkEvergreen, PostRecycleControls } from "./recycling-client";

export const metadata: Metadata = { title: "Content Recycling" };

const DAY_MS = 86_400_000;

/**
 * When this post is next eligible, in the rule's own terms. Mirrors
 * `dueForRecycle` in the engine: the clock runs from the post's last outing,
 * which is its most recent repost if it has one, otherwise its publish date.
 */
function nextDue(
  post: { publishedAt: Date | null; recycles: { scheduledAt: Date | null; createdAt: Date }[]; recyclePaused?: boolean; recycleExhausted?: boolean },
  rule: { frequencyDays: number; decayFactor?: number | null },
): string {
  if (post.recyclePaused) return " · paused";
  if (post.recycleExhausted) return " · exhausted (low ER)";
  if (!post.publishedAt) return "";
  const last = Math.max(
    post.publishedAt.getTime(),
    ...post.recycles.map((r) => (r.scheduledAt ?? r.createdAt).getTime()),
  );
  const factor = rule.decayFactor && rule.decayFactor > 1 ? Math.pow(rule.decayFactor, post.recycles.length) : 1;
  const effectiveDays = Math.round(rule.frequencyDays * factor);
  const days = Math.ceil((last + effectiveDays * DAY_MS - Date.now()) / DAY_MS);
  return days <= 0 ? " · due now" : ` · next in ${days}d`;
}

export default async function RecyclingPage() {
  const ctx = await requireWorkspace();
  if (!(await hasEntitlement(ctx.active.org.id, "evergreen_recycling"))) {
    return <UpgradeRequired feature="Evergreen recycling" />;
  }
  const wsId = ctx.active.workspace.id;

  const [rules, evergreen, candidates, pillars] = await Promise.all([
    db.recycleRule.findMany({
      where: { workspaceId: wsId },
      orderBy: { createdAt: "desc" },
      include: {
        pillar: { select: { id: true, name: true, color: true } },
        _count: { select: { posts: true } },
      },
    }),
    db.post.findMany({
      where: { workspaceId: wsId, isEvergreen: true, status: "published" },
      take: 60,
      include: {
        channels: { select: { platform: true, body: true } },
        recycleRule: true,
        recycles: { select: { scheduledAt: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { publishedAt: "desc" },
    }),
    // Top performers not yet evergreen — "worth repurposing"
    db.post.findMany({
      where: { workspaceId: wsId, status: "published", isEvergreen: false },
      take: 20,
      select: {
        id: true,
        title: true,
        channels: { select: { platform: true, body: true }, take: 1 },
        metrics: { select: { engagementRate: true } },
      },
      orderBy: { publishedAt: "desc" },
    }),
    db.contentPillar.findMany({
      where: { workspaceId: wsId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
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
        actions={<RecycNewRule pillars={pillars} />}
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
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-[var(--text)]">{r.name}</p>
                      {r.pillar && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: r.pillar.color ? `${r.pillar.color}20` : "var(--surface-hover)",
                            color: r.pillar.color || "var(--text)",
                          }}
                        >
                          {r.pillar.name}
                        </span>
                      )}
                    </div>
                    <RecycRuleRow id={r.id} enabled={r.enabled} />
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
                    Every {r.frequencyDays}d
                    {r.decayFactor && r.decayFactor > 1 ? ` · ${r.decayFactor}x decay` : ""}
                    {" "}· max {r.maxReposts} reposts · ≥{r.minGapDays}d gap
                    {r.minEngagementRate != null ? ` · min ${r.minEngagementRate}% ER` : ""}
                    {r.rotateVariations ? " · variations rotated" : ""}
                    {" "}· {r._count.posts} posts
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            {/* Ranked by measured engagement rate (see `scored` above) — no
                model is involved, so it must not be labelled AI. */}
            <CardTitle>Your best performers</CardTitle>
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
                  <>
                    <Badge tone="primary">{p.recycleRule.name}</Badge>
                    <span className="hidden shrink-0 text-[12px] text-[var(--text-subtle)] sm:inline">
                      {p.recycles.length}/{p.recycleRule.maxReposts} reposts
                      {p.recycles.length >= p.recycleRule.maxReposts
                        ? " · limit reached"
                        : nextDue(p, p.recycleRule)}
                    </span>
                  </>
                ) : (
                  <Badge tone="neutral">No rule</Badge>
                )}
                <PostRecycleControls
                  postId={p.id}
                  paused={p.recyclePaused}
                  exhausted={p.recycleExhausted}
                  variationsJson={p.recycleVariations}
                />
                <RecycMarkEvergreen postId={p.id} rules={rules.map((r) => ({ id: r.id, name: r.name }))} attached={p.recycleRuleId} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
