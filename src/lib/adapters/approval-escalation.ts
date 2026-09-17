import { db } from "@/lib/db";
import { notify, notifyWorkspace, logActivity } from "@/lib/events";
import { hasEntitlement } from "@/lib/entitlements";

/**
 * SLA timers for approval stages. Evaluated on each cron tick (see
 * scheduled-work.ts) against every open request's current stage.
 *
 * "Time in stage" is `now - stageEnteredAt` (falling back to updatedAt on
 * pre-migration rows). updatedAt alone was wrong: any row touch reset the
 * timer silently. stageEnteredAt moves only on stage transitions.
 */
export async function runApprovalEscalations(now = new Date()) {
  const open = await db.approvalRequest.findMany({
    where: { status: { in: ["in_review", "changes_requested"] } },
    include: { flow: { include: { stages: { orderBy: { order: "asc" } } } }, post: true },
  });

  let escalated = 0;
  let autoApproved = 0;
  let autoRejected = 0;

  for (const req of open) {
    const stage = req.flow.stages[req.currentStage];
    if (!stage?.timeoutHours || !stage.timeoutAction) continue;

    const enteredAt = req.stageEnteredAt ?? req.updatedAt;
    const overdue = now.getTime() - enteredAt.getTime() > stage.timeoutHours * 3_600_000;
    if (!overdue) continue;

    // changes_requested means the ball is with the author, not a reviewer:
    // escalating or auto-approving something nobody is reviewing is wrong.
    // Only "reject" (a harmless cleanup — the post is already back in draft
    // territory) still applies.
    if (req.status === "changes_requested" && stage.timeoutAction !== "reject") continue;

    // Downgraded orgs keep their data but lose the engine: the approval pages
    // are plan-gated, so the background timers must be too.
    const ws = await db.workspace.findUnique({ where: { id: req.post.workspaceId }, select: { orgId: true } });
    if (!ws || !(await hasEntitlement(ws.orgId, "approval_workflows"))) continue;

    if (stage.timeoutAction === "escalate") {
      if (!stage.escalateToRole || req.escalatedAt) continue; // already pinged once for this stage
      const targets = await db.workspaceMember.findMany({
        where: { workspaceId: req.post.workspaceId, role: stage.escalateToRole },
        select: { userId: true },
      });
      for (const t of targets) {
        await notify({
          userId: t.userId,
          type: "approval_request",
          title: "Approval overdue — escalated to you",
          body: `"${req.post.title ?? "A post"}" has been waiting on "${stage.name}" for over ${stage.timeoutHours}h.`,
          linkUrl: "/approvals",
        });
      }
      // Stamp even with zero targets: re-checking every tick would log
      // "acted" noise forever, and the log below says what happened.
      await db.approvalRequest.update({ where: { id: req.id }, data: { escalatedAt: now } });
      if (targets.length === 0) {
        await logActivity({
          workspaceId: req.post.workspaceId,
          verb: "approval_sla",
          entityType: "post",
          entityId: req.postId,
          summary: `SLA on "${stage.name}" expired for "${req.post.title ?? "Untitled post"}": escalate found no ${stage.escalateToRole} to notify`,
        });
        continue;
      }
      escalated++;
    } else if (stage.timeoutAction === "reject") {
      await db.approvalRequest.update({ where: { id: req.id }, data: { status: "rejected" } });
      await db.post.update({ where: { id: req.postId }, data: { status: "draft" } });
      await notifyWorkspace(req.post.workspaceId, {
        type: "approval_request",
        title: "Post auto-rejected (SLA expired)",
        body: `"${req.post.title ?? "Untitled post"}" sat on "${stage.name}" past its ${stage.timeoutHours}h limit and was sent back to draft.`,
        linkUrl: `/composer/${req.postId}`,
      });
      autoRejected++;
    } else if (stage.timeoutAction === "auto_approve") {
      const isFinal = req.currentStage >= req.flow.stages.length - 1;
      if (isFinal) {
        await db.approvalRequest.update({ where: { id: req.id }, data: { status: "approved" } });
        await db.post.update({ where: { id: req.postId }, data: { status: "approved" } });
      } else {
        await db.approvalRequest.update({
          where: { id: req.id },
          data: { currentStage: req.currentStage + 1, escalatedAt: null, stageEnteredAt: now },
        });
      }
      await notifyWorkspace(req.post.workspaceId, {
        type: "approval_request",
        title: "Post auto-approved (SLA expired)",
        body: `"${req.post.title ?? "Untitled post"}" cleared "${stage.name}" automatically after ${stage.timeoutHours}h with no response.`,
        linkUrl: isFinal ? `/composer/${req.postId}` : "/approvals",
      });
      autoApproved++;
    }

    await logActivity({
      workspaceId: req.post.workspaceId,
      verb: "approval_sla",
      entityType: "post",
      entityId: req.postId,
      summary: `SLA on "${stage.name}" expired for "${req.post.title ?? "Untitled post"}": ${stage.timeoutAction}`,
    });
  }

  return { escalated, autoApproved, autoRejected };
}
