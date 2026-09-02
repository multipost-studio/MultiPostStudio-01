import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { CampNew } from "./campaigns-client";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { new: openNew } = await searchParams;

  const campaigns = await db.campaign.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { posts: true, ideas: true } },
      posts: { where: { status: "published" }, include: { metrics: true } },
    },
  });

  const canEdit = can(ctx.active.role, "content.create");

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Group content around an objective and track it end to end."
        actions={canEdit && <CampNew open={openNew === "1"} />}
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create a campaign to organize posts around a launch, event or theme."
          action={canEdit && <CampNew />}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => {
            const engagement = c.posts.reduce(
              (s, p) => s + p.metrics.reduce((n, m) => n + m.likes + m.comments + m.shares + m.saves, 0),
              0,
            );
            const postPct = c.goalPosts ? Math.min(100, (c._count.posts / c.goalPosts) * 100) : 0;
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--primary)]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="text-[15px] font-semibold text-[var(--text)]">{c.name}</span>
                  </span>
                  <Badge tone={c.status === "active" ? "success" : c.status === "completed" ? "info" : "neutral"}>{c.status}</Badge>
                </div>
                <p className="mt-1 text-[13px] capitalize text-[var(--text-muted)]">{c.objective}</p>
                <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
                  {c.startDate ? formatDate(c.startDate) : "—"} → {c.endDate ? formatDate(c.endDate) : "—"}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[16px] font-semibold tabular-nums text-[var(--text)]">{c._count.posts}</p>
                    <p className="text-[11px] text-[var(--text-subtle)]">posts</p>
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold tabular-nums text-[var(--text)]">{c._count.ideas}</p>
                    <p className="text-[11px] text-[var(--text-subtle)]">ideas</p>
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold tabular-nums text-[var(--text)]">{engagement}</p>
                    <p className="text-[11px] text-[var(--text-subtle)]">engagement</p>
                  </div>
                </div>
                {c.goalPosts ? (
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] text-[var(--text-subtle)]">
                      {c._count.posts}/{c.goalPosts} posts
                    </p>
                    <Progress value={postPct} />
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
