"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logActivity, notifyWorkspace, notifyMentions, logAudit } from "@/lib/events";
import { dispatchWebhook } from "@/lib/adapters/webhooks";
import { withPermission, entitlementGuard, ensureInWorkspace, snapshotPostVersion, ok, fail, type ActionResult } from "./_helpers";
import { canActAtStage } from "@/lib/rbac";
import { ROLE_LABELS, WORKSPACE_ROLES } from "@/lib/constants";

/** Submit a post into its workspace's default approval flow. */
export async function requestApprovalAction(postId: string): Promise<ActionResult> {
  const ctx = await withPermission("content.create");
  const ent = await entitlementGuard(ctx.active.org.id, "approval_workflows", "Approval workflows");
  if (ent) return ent;
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);

  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { channels: true } });
  if (post.channels.length === 0) return fail("Add at least one channel first");
  if (["published", "publishing"].includes(post.status)) return fail("Post is already live");

  let flow = await db.approvalFlow.findFirst({
    where: { workspaceId: ctx.active.workspace.id, isDefault: true, active: true },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  if (!flow) {
    flow = await db.approvalFlow.create({
      data: {
        workspaceId: ctx.active.workspace.id,
        name: "Standard review",
        isDefault: true,
        stages: { create: [{ order: 0, name: "Manager sign-off", roleGate: "manager" }] },
      },
      include: { stages: { orderBy: { order: "asc" } } },
    });
  }

  const existing = await db.approvalRequest.findFirst({
    where: { postId, status: { in: ["in_review", "changes_requested"] } },
  });
  if (existing) {
    if (existing.status === "changes_requested") {
      return resubmitApprovalAction(postId, "Revisions resubmitted for approval");
    }
    return fail("This post is already in review");
  }

  await db.approvalRequest.create({
    data: { flowId: flow.id, postId, currentStage: 0, status: "in_review", stageEnteredAt: new Date() },
  });
  await db.post.update({ where: { id: postId }, data: { status: "awaiting_approval" } });

  await notifyWorkspace(
    ctx.active.workspace.id,
    {
      type: "approval_request",
      title: "Approval needed",
      body: `"${post.title ?? "Untitled post"}" is waiting for review.`,
      linkUrl: "/approvals",
    },
    ctx.user.id,
  );
  await dispatchWebhook(ctx.active.org.id, "approval.requested", { postId });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "requested_approval",
    entityType: "post",
    entityId: postId,
    summary: `Requested approval for "${post.title ?? "Untitled post"}"`,
  });

  revalidatePath("/approvals");
  revalidatePath(`/composer/${postId}`);
  return ok(undefined, "Sent for approval");
}

type Decision = "approve" | "reject" | "request_changes";

export async function decideApprovalAction(
  requestId: string,
  decision: Decision,
  comment?: string,
  reasonCategory?: string,
) {
  const ctx = await withPermission("content.approve");

  const req = await db.approvalRequest.findUnique({
    where: { id: requestId },
    include: { flow: { include: { stages: { orderBy: { order: "asc" } } } }, post: true },
  });
  if (!req || req.post.workspaceId !== ctx.active.workspace.id) return fail("Approval request not found");
  if (req.status === "approved" || req.status === "rejected") return fail("This request is already closed");

  const stage = req.flow.stages[req.currentStage];

  // The generic content.approve permission is not sufficient: each stage
  // carries its own roleGate ("role required to act at this stage"). Without
  // this check any approver could clear a manager-only or client-only stage.
  // Checked server-side and before any state change — the UI hiding a button
  // is UX, not security.
  if (!stage) return fail("This approval flow has no stage to act on");
  if (!canActAtStage(ctx.active.role, stage.roleGate)) {
    const needed = ROLE_LABELS[stage.roleGate] ?? stage.roleGate;
    await logAudit({
      orgId: ctx.active.org.id,
      actorId: ctx.user.id,
      action: "approval.denied_role_gate",
      targetType: "approvalRequest",
      targetId: requestId,
      metadata: { stage: stage.name, roleGate: stage.roleGate, actorRole: ctx.active.role },
    });
    return fail(`This stage needs ${needed} approval — your role can't sign it off.`);
  }

  // Atomic decision guard: two approvers racing the same stage must not both
  // advance it. The status+currentStage predicate makes the first writer win;
  // the loser gets a clear "already decided" instead of a double advance,
  // double notification, and double snapshot.
  const isFinal = decision === "approve" && req.currentStage >= req.flow.stages.length - 1;
  const decisionData =
    decision === "reject"
      ? { status: "rejected" }
      : decision === "request_changes"
        ? { status: "changes_requested", escalatedAt: null }
        : isFinal
          ? { status: "approved" }
          : { currentStage: req.currentStage + 1, escalatedAt: null, stageEnteredAt: new Date() };
  const guard = await db.approvalRequest.updateMany({
    where: { id: requestId, status: { in: ["in_review", "changes_requested"] }, currentStage: req.currentStage },
    data: decisionData,
  });
  if (guard.count === 0) return fail("Someone already decided on this request — refresh to see the latest state");

  await db.approvalAction.create({
    data: {
      requestId,
      stageId: stage?.id,
      actorId: ctx.user.id,
      action: decision,
      reasonCategory: decision === "request_changes" ? reasonCategory?.trim() || null : null,
      comment: comment?.trim() || null,
    },
  });

  if (decision === "reject") {
    await db.post.update({ where: { id: req.postId }, data: { status: "draft" } });
    await notifyWorkspace(ctx.active.workspace.id, {
      type: "approval_request",
      title: "Post rejected",
      body: `"${req.post.title ?? "Untitled post"}" was rejected. ${comment ?? ""}`.trim(),
      linkUrl: `/composer/${req.postId}`,
    });
  } else if (decision === "request_changes") {
    await db.post.update({ where: { id: req.postId }, data: { status: "draft" } });
    await notifyWorkspace(ctx.active.workspace.id, {
      type: "approval_request",
      title: "Changes requested",
      body: `"${req.post.title ?? "Untitled post"}": ${comment ?? "see comments"}`,
      linkUrl: `/composer/${req.postId}`,
    });
  } else {
    // approve
    if (isFinal) {
      // Freeze an immutable approved snapshot — never overwrite silently.
      await snapshotPostVersion(req.postId, ctx.user.id, "Approved version (locked)");
      const post = await db.post.findUniqueOrThrow({ where: { id: req.postId }, include: { channels: true } });
      await db.approvalRequest.update({
        where: { id: requestId },
        data: {
          approvedSnapshot: JSON.stringify({
            approvedAt: new Date().toISOString(),
            approvedBy: ctx.user.id,
            channels: post.channels.map((c) => ({ platform: c.platform, body: c.body })),
          }),
        },
      });
      await db.post.update({ where: { id: req.postId }, data: { status: "approved" } });
      await dispatchWebhook(ctx.active.org.id, "approval.approved", { postId: req.postId });
      await notifyWorkspace(ctx.active.workspace.id, {
        type: "approval_request",
        title: "Post approved",
        body: `"${req.post.title ?? "Untitled post"}" is approved and ready to schedule.`,
        linkUrl: `/composer/${req.postId}`,
      });
    } else {
      const next = req.flow.stages[req.currentStage + 1];
      await notifyWorkspace(ctx.active.workspace.id, {
        type: "approval_request",
        title: "Approval advanced",
        body: `"${req.post.title ?? "Untitled post"}" moved to: ${next?.name ?? "next stage"}.`,
        linkUrl: "/approvals",
      });
    }
  }

  await logAudit({
    orgId: ctx.active.org.id,
    actorId: ctx.user.id,
    action: `approval.${decision}`,
    targetType: "post",
    targetId: req.postId,
    metadata: { requestId, stage: stage?.name, comment },
  });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "requested_changes",
    entityType: "post",
    entityId: req.postId,
    summary: `${decision.replace("_", " ")} "${req.post.title ?? "Untitled post"}"`,
  });

  revalidatePath("/approvals");
  revalidatePath(`/composer/${req.postId}`);
  return ok(undefined, `Recorded: ${decision.replace("_", " ")}`);
}

export async function addApprovalCommentAction(requestId: string, comment: string) {
  const ctx = await withPermission("analytics.view");
  const req = await db.approvalRequest.findUnique({ where: { id: requestId }, include: { post: true } });
  if (!req || req.post.workspaceId !== ctx.active.workspace.id) return fail("Not found");
  if (!comment.trim()) return fail("Comment is empty");
  await db.approvalAction.create({
    data: { requestId, actorId: ctx.user.id, action: "comment", comment: comment.trim() },
  });
  await notifyMentions({
    workspaceId: ctx.active.workspace.id,
    text: comment,
    authorId: ctx.user.id,
    title: `${ctx.user.name} mentioned you in an approval`,
    body: comment.trim().slice(0, 240),
    linkUrl: "/approvals",
  });
  revalidatePath("/approvals");
  return ok(undefined, "Comment added");
}

/**
 * Resubmit a post for approval after author addressed requested changes.
 */
export async function resubmitApprovalAction(postId: string, note?: string): Promise<ActionResult> {
  const ctx = await withPermission("content.create");
  const ent = await entitlementGuard(ctx.active.org.id, "approval_workflows", "Approval workflows");
  if (ent) return ent;
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);

  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { channels: true } });
  if (post.channels.length === 0) return fail("Add at least one channel first");

  // Look for the open request currently in changes_requested
  const req = await db.approvalRequest.findFirst({
    where: { postId, status: "changes_requested" },
    include: { flow: { include: { stages: { orderBy: { order: "asc" } } } } },
  });

  if (!req) {
    // Fall back to standard requestApprovalAction if not in changes_requested
    return requestApprovalAction(postId);
  }

  // Snapshot the revised version
  await snapshotPostVersion(postId, ctx.user.id, note ? `Revised: ${note}` : "Revised version resubmitted");

  // Advance state back to in_review, increment resubmissionCount, reset stageEnteredAt
  await db.approvalRequest.update({
    where: { id: req.id },
    data: {
      status: "in_review",
      stageEnteredAt: new Date(),
      escalatedAt: null,
      resubmissionCount: { increment: 1 },
    },
  });

  await db.approvalAction.create({
    data: {
      requestId: req.id,
      stageId: req.flow.stages[req.currentStage]?.id,
      actorId: ctx.user.id,
      action: "resubmit",
      comment: note?.trim() || "Resubmitted with requested revisions",
    },
  });

  await db.post.update({
    where: { id: postId },
    data: { status: "awaiting_approval" },
  });

  await notifyWorkspace(
    ctx.active.workspace.id,
    {
      type: "approval_request",
      title: "Revisions resubmitted for approval",
      body: `"${post.title ?? "Untitled post"}" has been revised and resubmitted for review.`,
      linkUrl: "/approvals",
    },
    ctx.user.id,
  );

  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "resubmitted_approval",
    entityType: "post",
    entityId: postId,
    summary: `Resubmitted revised "${post.title ?? "Untitled post"}" for approval`,
  });

  revalidatePath("/approvals");
  revalidatePath(`/composer/${postId}`);
  return ok(undefined, "Revisions resubmitted for approval");
}

/* ---------------- flow configuration ---------------- */

type StageInput = {
  name: string;
  roleGate: string;
  timeoutHours?: number | null;
  timeoutAction?: string | null;
  escalateToRole?: string | null;
};

// Server-side allowlists mirroring the flow-editor UI. roleGate drives
// canActAtStage, so a free-form gate ("viewer") would hand approval power to
// roles the editor never intended — validate, don't trust the client.
const ROLE_GATES = new Set<string>(WORKSPACE_ROLES);
const TIMEOUT_ACTIONS = new Set(["escalate", "reject", "auto_approve"]);

function stageCreateData(s: StageInput, order: number) {
  const hours = s.timeoutHours && s.timeoutHours > 0 ? Math.min(Math.floor(s.timeoutHours), 720) : null;
  return {
    order,
    name: String(s.name ?? "").trim().slice(0, 80),
    roleGate: s.roleGate,
    timeoutHours: hours,
    timeoutAction: hours ? s.timeoutAction ?? null : null,
    escalateToRole: hours && s.timeoutAction === "escalate" ? s.escalateToRole ?? null : null,
  };
}

export async function saveApprovalFlowAction(input: {
  flowId?: string;
  name: string;
  stages: StageInput[];
}) {
  const ctx = await withPermission("approvals.configure");
  const ent = await entitlementGuard(ctx.active.org.id, "approval_workflows", "Approval workflows");
  if (ent) return ent;
  if (input.stages.length === 0) return fail("Add at least one stage");
  if (input.stages.length > 20) return fail("Too many stages (max 20)");
  for (const s of input.stages) {
    const name = String(s.name ?? "").trim();
    if (!name) return fail("Every stage needs a name");
    if (!ROLE_GATES.has(s.roleGate)) return fail(`Stage "${name}": invalid approver role`);
    if (s.timeoutAction != null && !TIMEOUT_ACTIONS.has(s.timeoutAction)) {
      return fail(`Stage "${name}": invalid timeout action`);
    }
    if (s.timeoutHours && s.timeoutHours > 0 && s.timeoutAction === "escalate") {
      if (!s.escalateToRole) return fail(`Stage "${name}": pick a role to escalate to`);
      if (!ROLE_GATES.has(s.escalateToRole)) return fail(`Stage "${name}": invalid escalation role`);
    }
  }

  if (input.flowId) {
    // `flowId` is client-supplied. Without this check, any user with
    // approvals.configure in ANY workspace could pass a flowId belonging to a
    // different workspace and wipe or overwrite its stages — a cross-tenant
    // IDOR, not just a bad-request case.
    const owned = await db.approvalFlow.findFirst({
      where: { id: input.flowId, workspaceId: ctx.active.workspace.id },
      select: { id: true },
    });
    if (!owned) return fail("Approval flow not found");

    await db.approvalStage.deleteMany({ where: { flowId: input.flowId } });
    await db.approvalFlow.update({
      where: { id: input.flowId },
      data: {
        name: input.name,
        stages: { create: input.stages.map((s, i) => stageCreateData(s, i)) },
      },
    });
  } else {
    const count = await db.approvalFlow.count({ where: { workspaceId: ctx.active.workspace.id } });
    await db.approvalFlow.create({
      data: {
        workspaceId: ctx.active.workspace.id,
        name: input.name,
        isDefault: count === 0,
        stages: { create: input.stages.map((s, i) => stageCreateData(s, i)) },
      },
    });
  }
  revalidatePath("/approvals");
  return ok(undefined, "Approval flow saved");
}
