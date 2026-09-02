import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/misc";
import { ApprovalsQueue, ApprovalsFlows, ApprovalsNewFlow } from "./approvals-client";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;

  const [requests, flows, closed] = await Promise.all([
    db.approvalRequest.findMany({
      where: { post: { workspaceId: wsId }, status: { in: ["in_review", "changes_requested"] } },
      orderBy: { createdAt: "asc" },
      include: {
        post: { include: { channels: true, author: { select: { name: true } } } },
        flow: { include: { stages: { orderBy: { order: "asc" } } } },
        actions: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
      },
    }),
    db.approvalFlow.findMany({
      where: { workspaceId: wsId },
      include: { stages: { orderBy: { order: "asc" } }, _count: { select: { requests: true } } },
    }),
    db.approvalRequest.findMany({
      where: { post: { workspaceId: wsId }, status: { in: ["approved", "rejected"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: { post: { select: { id: true, title: true } } },
    }),
  ]);

  const canApprove = can(ctx.active.role, "content.approve");
  const canConfigure = can(ctx.active.role, "approvals.configure");

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Multi-stage review with an immutable audit trail. Approved versions are locked, never overwritten silently."
        actions={canConfigure && <ApprovalsNewFlow />}
      />

      {requests.length === 0 ? (
        <EmptyState title="Nothing awaiting approval" description="Posts sent for review will appear here." />
      ) : (
        <ApprovalsQueue
          canApprove={canApprove}
          requests={requests.map((r) => ({
            id: r.id,
            status: r.status,
            currentStage: r.currentStage,
            createdAt: r.createdAt.toISOString(),
            post: {
              id: r.post.id,
              title: r.post.title ?? "Untitled post",
              author: r.post.author.name,
              bodies: r.post.channels.map((c) => ({ platform: c.platform, body: c.body })),
            },
            stages: r.flow.stages.map((s) => ({ name: s.name, roleGate: s.roleGate })),
            actions: r.actions.map((a) => ({
              id: a.id,
              action: a.action,
              comment: a.comment,
              actor: a.actor.name,
              createdAt: a.createdAt.toISOString(),
            })),
          }))}
        />
      )}

      <ApprovalsFlows
        canConfigure={canConfigure}
        flows={flows.map((f) => ({
          id: f.id,
          name: f.name,
          isDefault: f.isDefault,
          stages: f.stages.map((s) => ({ name: s.name, roleGate: s.roleGate })),
          usage: f._count.requests,
        }))}
      />

      {closed.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">Recently closed</p>
          <ul className="space-y-1.5">
            {closed.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px]">
                <span className="text-[var(--text)]">{c.post.title ?? "Untitled post"}</span>
                <span className={c.status === "approved" ? "text-[var(--success)]" : "text-[var(--danger)]"}>{c.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
