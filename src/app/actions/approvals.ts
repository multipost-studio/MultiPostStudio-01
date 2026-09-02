"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logActivity, notifyWorkspace, logAudit } from "@/lib/events";
import { dispatchWebhook } from "@/lib/adapters/webhooks";
import { withPermission, ensureInWorkspace, snapshotPostVersion, ok, fail } from "./_helpers";

/** Submit a post into its workspace's default approval flow. */
export async function requestApprovalAction(postId: string) {
  const ctx = await withPermission("content.create");
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
  if (existing) return fail("This post is already in review");

  await db.approvalRequest.create({
    data: { flowId: flow.id, postId, currentStage: 0, status: "in_review" },
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

export async function decideApprovalAction(requestId: string, decision: Decision, comment?: string) {
  const ctx = await withPermission("content.approve");

  const req = await db.approvalRequest.findUnique({
    where: { id: requestId },
    include: { flow: { include: { stages: { orderBy: { order: "asc" } } } }, post: true },
  });
  if (!req || req.post.workspaceId !== ctx.active.workspace.id) return fail("Approval request not found");
  if (req.status === "approved" || req.status === "rejected") return fail("This request is already closed");

  const stage = req.flow.stages[req.currentStage];

  await db.approvalAction.create({
    data: {
      requestId,
      stageId: stage?.id,
      actorId: ctx.user.id,
      action: decision,
      comment: comment?.trim() || null,
    },
  });

  if (decision === "reject") {
    await db.approvalRequest.update({ where: { id: requestId }, data: { status: "rejected" } });
    await db.post.update({ where: { id: req.postId }, data: { status: "draft" } });
    await notifyWorkspace(ctx.active.workspace.id, {
      type: "approval_request",
      title: "Post rejected",
      body: `"${req.post.title ?? "Untitled post"}" was rejected. ${comment ?? ""}`.trim(),
      linkUrl: `/composer/${req.postId}`,
    });
  } else if (decision === "request_changes") {
    await db.approvalRequest.update({ where: { id: requestId }, data: { status: "changes_requested" } });
    await db.post.update({ where: { id: req.postId }, data: { status: "draft" } });
    await notifyWorkspace(ctx.active.workspace.id, {
      type: "approval_request",
      title: "Changes requested",
      body: `"${req.post.title ?? "Untitled post"}": ${comment ?? "see comments"}`,
      linkUrl: `/composer/${req.postId}`,
    });
  } else {
    // approve
    const isFinal = req.currentStage >= req.flow.stages.length - 1;
    if (isFinal) {
      // Freeze an immutable approved snapshot — never overwrite silently.
      await snapshotPostVersion(req.postId, ctx.user.id, "Approved version (locked)");
      const post = await db.post.findUniqueOrThrow({ where: { id: req.postId }, include: { channels: true } });
      await db.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: "approved",
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
      await db.approvalRequest.update({
        where: { id: requestId },
        data: { currentStage: req.currentStage + 1 },
      });
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
  revalidatePath("/approvals");
  return ok(undefined, "Comment added");
}

/* ---------------- flow configuration ---------------- */

export async function saveApprovalFlowAction(input: {
  flowId?: string;
  name: string;
  stages: { name: string; roleGate: string }[];
}) {
  const ctx = await withPermission("approvals.configure");
  if (input.stages.length === 0) return fail("Add at least one stage");

  if (input.flowId) {
    await db.approvalStage.deleteMany({ where: { flowId: input.flowId } });
    await db.approvalFlow.update({
      where: { id: input.flowId },
      data: {
        name: input.name,
        stages: { create: input.stages.map((s, i) => ({ order: i, name: s.name, roleGate: s.roleGate })) },
      },
    });
  } else {
    const count = await db.approvalFlow.count({ where: { workspaceId: ctx.active.workspace.id } });
    await db.approvalFlow.create({
      data: {
        workspaceId: ctx.active.workspace.id,
        name: input.name,
        isDefault: count === 0,
        stages: { create: input.stages.map((s, i) => ({ order: i, name: s.name, roleGate: s.roleGate })) },
      },
    });
  }
  revalidatePath("/approvals");
  return ok(undefined, "Approval flow saved");
}
