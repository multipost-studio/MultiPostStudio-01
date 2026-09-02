import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { HealthRing } from "@/components/health-ring";
import { AgencySwitch } from "./agency-switch";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Agency" };

export default async function AgencyPage() {
  const ctx = await requireWorkspace();
  if (ctx.active.org.type !== "agency" || !can(ctx.active.role, "agency.manage")) {
    redirect("/dashboard");
  }
  const orgId = ctx.active.org.id;

  const workspaces = await db.workspace.findMany({
    where: { orgId, archived: false },
    include: {
      _count: { select: { posts: true } },
      posts: {
        where: { status: { in: ["scheduled", "approved"] } },
        select: { id: true },
      },
      healthScores: { orderBy: { date: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  const wsIds = workspaces.map((w) => w.id);
  const [pendingApprovals, openConversations, negativeConv, snapshots] = await Promise.all([
    db.approvalRequest.groupBy({
      by: ["postId"],
      where: { post: { workspaceId: { in: wsIds } }, status: { in: ["in_review", "changes_requested"] } },
      _count: true,
    }),
    db.conversation.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: wsIds }, status: "open" },
      _count: true,
    }),
    db.conversation.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: wsIds }, sentiment: "negative", status: { in: ["open", "pending"] } },
      _count: true,
    }),
    db.metricSnapshot.findMany({
      where: { workspaceId: { in: wsIds }, channelId: null },
      orderBy: { date: "desc" },
      take: wsIds.length * 30,
    }),
  ]);

  const approvalsByPost = new Set(pendingApprovals.map((a) => a.postId));
  const openByWs = Object.fromEntries(openConversations.map((c) => [c.workspaceId, c._count]));
  const negByWs = Object.fromEntries(negativeConv.map((c) => [c.workspaceId, c._count]));

  const clients = workspaces.filter((w) => w.kind === "client");
  const totalScheduled = workspaces.reduce((s, w) => s + w.posts.length, 0);
  const totalOpen = Object.values(openByWs).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Agency overview"
        description={`${clients.length} client workspaces · ${ctx.active.org.name}`}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Client workspaces" value={clients.length} />
        <Stat label="Scheduled content" value={totalScheduled} />
        <Stat label="Pending approvals" value={approvalsByPost.size} />
        <Stat label="Open conversations" value={totalOpen} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workspaces.map((w) => {
          const wsSnaps = snapshots.filter((s) => s.workspaceId === w.id).sort((a, b) => +a.date - +b.date);
          const followersNow = wsSnaps.at(-1)?.followers ?? 0;
          const followersPrev = wsSnaps.at(-8)?.followers ?? followersNow;
          const growth = followersPrev ? ((followersNow - followersPrev) / followersPrev) * 100 : 0;
          const neg = negByWs[w.id] ?? 0;
          const health = w.healthScores[0]?.score ?? 0;

          return (
            <Card key={w.id}>
              <CardHeader>
                <div>
                  <CardTitle>{w.name}</CardTitle>
                  <p className="text-[12px] text-[var(--text-subtle)]">
                    {w.kind === "client" ? w.clientName ?? "Client" : "Brand"} · {w.industry ?? "—"}
                  </p>
                </div>
                <HealthRing score={health} size={54} label="" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center text-[13px]">
                  <div>
                    <p className="font-semibold tabular-nums text-[var(--text)]">{w.posts.length}</p>
                    <p className="text-[11px] text-[var(--text-subtle)]">scheduled</p>
                  </div>
                  <div>
                    <p className="font-semibold tabular-nums text-[var(--text)]">{openByWs[w.id] ?? 0}</p>
                    <p className="text-[11px] text-[var(--text-subtle)]">inbox</p>
                  </div>
                  <div>
                    <p className={`font-semibold tabular-nums ${growth >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                      {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
                    </p>
                    <p className="text-[11px] text-[var(--text-subtle)]">growth</p>
                  </div>
                </div>
                <p className="text-[12px] text-[var(--text-subtle)]">
                  {formatNumber(followersNow)} followers
                </p>
                {neg > 0 && (
                  <Badge tone="danger" dot>
                    {neg} conversation{neg === 1 ? "" : "s"} need attention
                  </Badge>
                )}
                <AgencySwitch workspaceId={w.id} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[14px] text-[var(--text-muted)]">
        <p className="font-semibold text-[var(--text)]">Client access & white-label</p>
        <p className="mt-1">
          Add a client as a <span className="font-medium">Client</span> workspace member from the Team page — they see only
          approvals and reports for their workspace. Enable white-label branding per report in the Report Builder.
        </p>
      </div>
    </>
  );
}
