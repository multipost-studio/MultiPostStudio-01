import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { InlineEmpty } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformBadge } from "@/components/brand";
import { PortalHeader } from "../portal-header";
import { formatNumber } from "@/lib/utils";
import { TrendingUp, Users, Eye, FileText, Heart } from "lucide-react";

async function loadLink(token: string) {
  if (!/^port_[a-f0-9]{20,64}$/.test(token)) return null;
  const link = await db.portalLink.findUnique({
    where: { token },
    select: {
      id: true,
      label: true,
      logoUrl: true,
      primaryColor: true,
      expiresAt: true,
      revokedAt: true,
      workspace: { select: { id: true, name: true } },
    },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt.getTime() < Date.now())) return null;
  return link;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const link = await loadLink(token);
  return {
    title: link ? `Performance Reports — ${link.workspace.name}` : "Client Reports",
    robots: { index: false, follow: false },
  };
}

export default async function PortalReportsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await loadLink(token);
  if (!link) notFound();

  const [snapshots, publishedPostsCount, recentPublished] = await Promise.all([
    db.metricSnapshot.findMany({
      where: { workspaceId: link.workspace.id, channelId: null },
      orderBy: { date: "asc" },
      take: 30,
      select: { date: true, followers: true, impressions: true, engagement: true, reach: true },
    }),
    db.post.count({
      where: { workspaceId: link.workspace.id, status: "published" },
    }),
    db.post.findMany({
      where: { workspaceId: link.workspace.id, status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 5,
      include: {
        channels: true,
        metrics: true,
      },
    }),
  ]);

  const latestSnap = snapshots.at(-1);
  const oldestSnap = snapshots.at(0);
  const followersNow = latestSnap?.followers ?? 0;
  const followersPrev = oldestSnap?.followers ?? followersNow;
  const followerGrowth = followersPrev > 0
    ? ((followersNow - followersPrev) / followersPrev) * 100
    : 0;

  const totalImpressions = snapshots.reduce((sum, s) => sum + s.impressions, 0);
  const totalEngagement = snapshots.reduce((sum, s) => sum + s.engagement, 0);
  const avgEngagementRate = totalImpressions > 0
    ? totalEngagement / totalImpressions
    : 0;

  return (
    <main className="min-h-screen bg-[var(--bg)] px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <PortalHeader
          token={token}
          workspaceName={link.workspace.name}
          linkLabel={link.label}
          logoUrl={link.logoUrl}
          primaryColor={link.primaryColor}
          activeTab="reports"
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-[13px] font-medium text-[var(--text-muted)]">
                <span>Audience</span>
                <Users className="h-4 w-4 text-[var(--text-subtle)]" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-[22px] font-bold text-[var(--text)]">
                {formatNumber(followersNow)}
              </div>
              <p className={`mt-1 flex items-center text-[12px] ${followerGrowth >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                <TrendingUp className="mr-1 h-3 w-3 inline" />
                {followerGrowth >= 0 ? "+" : ""}{followerGrowth.toFixed(1)}% (30d)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-[13px] font-medium text-[var(--text-muted)]">
                <span>Impressions</span>
                <Eye className="h-4 w-4 text-[var(--text-subtle)]" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-[22px] font-bold text-[var(--text)]">
                {formatNumber(totalImpressions)}
              </div>
              <p className="mt-1 text-[12px] text-[var(--text-subtle)]">Last 30 days total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-[13px] font-medium text-[var(--text-muted)]">
                <span>Avg Engagement</span>
                <Heart className="h-4 w-4 text-[var(--text-subtle)]" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-[22px] font-bold text-[var(--text)]">
                {(avgEngagementRate * 100).toFixed(2)}%
              </div>
              <p className="mt-1 text-[12px] text-[var(--text-subtle)]">Interactions / reach</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-[13px] font-medium text-[var(--text-muted)]">
                <span>Published Posts</span>
                <FileText className="h-4 w-4 text-[var(--text-subtle)]" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-[22px] font-bold text-[var(--text)]">
                {publishedPostsCount}
              </div>
              <p className="mt-1 text-[12px] text-[var(--text-subtle)]">Active campaigns</p>
            </CardContent>
          </Card>
        </div>

        <section className="mt-8 space-y-4">
          <h2 className="text-[16px] font-semibold text-[var(--text)]">
            Recent Published Performance
          </h2>

          {recentPublished.length === 0 ? (
            <InlineEmpty
              title="No published posts yet"
              hint="Performance metrics for published posts will show up here."
            />
          ) : (
            <div className="space-y-3">
              {recentPublished.map((post) => {
                const totalLikes = post.metrics.reduce((s, m) => s + m.likes, 0);
                const totalImp = post.metrics.reduce((s, m) => s + m.impressions, 0);
                const totalClicks = post.metrics.reduce((s, m) => s + m.clicks, 0);

                return (
                  <div
                    key={post.id}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[14px] text-[var(--text)]">
                        {post.title || "Untitled Post"}
                      </p>
                      <span className="text-[12px] text-[var(--text-subtle)]">
                        {post.publishedAt
                          ? new Date(post.publishedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "Published"}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {post.channels.map((c, i) => (
                        <PlatformBadge key={i} platform={c.platform} />
                      ))}
                    </div>

                    {post.channels[0]?.body && (
                      <p className="mt-2 line-clamp-2 text-[13px] text-[var(--text-muted)]">
                        {post.channels[0].body}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-2.5 text-[12px] text-[var(--text-subtle)]">
                      <div>
                        <span className="font-semibold text-[var(--text)]">{formatNumber(totalImp)}</span> impressions
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--text)]">{formatNumber(totalLikes)}</span> likes
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--text)]">{formatNumber(totalClicks)}</span> clicks
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
