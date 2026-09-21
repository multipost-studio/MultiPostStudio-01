"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { notifyWorkspace, logActivity, logAudit } from "@/lib/events";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { withPermission, ok, fail } from "./_helpers";

/**
 * Client guest review portal. A PortalLink is a bearer token — anyone who
 * has the URL can act on it, same trust model as the existing report share
 * links (see share/report/[token]). Scope is intentionally narrow: it can
 * only act on approval requests whose CURRENT stage is gated to the
 * "client" role, so an admin decides exactly what a client link can touch by
 * how they build the approval flow — nothing else in the workspace is
 * reachable through it.
 */

import { validateHexColor, validateLogoUrl } from "@/lib/portal-branding";

export async function createPortalLinkAction(input: {
  label: string;
  expiresInDays?: number;
  logoUrl?: string | null;
  primaryColor?: string | null;
}) {
  const ctx = await withPermission("approvals.configure");
  const label = input.label.trim();
  if (!label) return fail("Name this link (e.g. the client's name)");

  if (input.primaryColor && !validateHexColor(input.primaryColor)) {
    return fail("Primary color must be a valid hex color code (e.g. #4F46E5)");
  }
  if (input.logoUrl && !validateLogoUrl(input.logoUrl)) {
    return fail("Logo URL must be a valid web URL or image asset");
  }

  const token = `port_${randomBytes(20).toString("hex")}`;
  const days = input.expiresInDays ?? 30;
  if (!Number.isInteger(days) || days < 0 || days > 3650) {
    return fail("Expiry must be 0–3650 days (0 = never expires)");
  }
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;

  const link = await db.portalLink.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      label,
      token,
      logoUrl: input.logoUrl?.trim() || null,
      primaryColor: input.primaryColor?.trim() || null,
      expiresAt,
      createdById: ctx.user.id,
    },
  });
  await logAudit({
    orgId: ctx.active.org.id,
    actorId: ctx.user.id,
    action: "portal_link.created",
    targetType: "portalLink",
    targetId: link.id,
    metadata: { label },
  });
  revalidatePath("/approvals");
  revalidatePath("/agency");
  return ok({ token: link.token });
}

export async function updatePortalBrandingAction(input: {
  linkId: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}) {
  const ctx = await withPermission("approvals.configure");
  const owned = await db.portalLink.findFirst({
    where: { id: input.linkId, workspaceId: ctx.active.workspace.id },
  });
  if (!owned) return fail("Link not found");

  if (input.primaryColor !== undefined && !validateHexColor(input.primaryColor)) {
    return fail("Primary color must be a valid hex color code (e.g. #4F46E5)");
  }
  if (input.logoUrl !== undefined && !validateLogoUrl(input.logoUrl)) {
    return fail("Logo URL must be a valid web URL or image asset");
  }

  await db.portalLink.update({
    where: { id: input.linkId },
    data: {
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl?.trim() || null } : {}),
      ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor?.trim() || null } : {}),
    },
  });

  revalidatePath("/approvals");
  revalidatePath("/agency");
  return ok(undefined, "Portal branding updated");
}

export async function extendPortalLinkAction(input: { linkId: string; extraDays: number }) {
  const ctx = await withPermission("approvals.configure");
  const owned = await db.portalLink.findFirst({
    where: { id: input.linkId, workspaceId: ctx.active.workspace.id },
  });
  if (!owned) return fail("Link not found");

  const extraDays = input.extraDays;
  if (!Number.isInteger(extraDays) || extraDays <= 0 || extraDays > 365) {
    return fail("Extension must be between 1 and 365 days");
  }

  const baseDate = owned.expiresAt && owned.expiresAt.getTime() > Date.now()
    ? owned.expiresAt.getTime()
    : Date.now();
  const newExpiresAt = new Date(baseDate + extraDays * 86_400_000);

  await db.portalLink.update({
    where: { id: input.linkId },
    data: { expiresAt: newExpiresAt, revokedAt: null },
  });

  revalidatePath("/approvals");
  revalidatePath("/agency");
  return ok({ expiresAt: newExpiresAt.toISOString() }, "Link expiration extended");
}

export async function listPortalLinksAction() {
  const ctx = await withPermission("approvals.configure");
  const rows = await db.portalLink.findMany({
    where: { workspaceId: ctx.active.workspace.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return ok(
    rows.map((r) => ({
      id: r.id,
      label: r.label,
      token: r.token,
      logoUrl: r.logoUrl,
      primaryColor: r.primaryColor,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  );
}

export async function revokePortalLinkAction(id: string) {
  const ctx = await withPermission("approvals.configure");
  const owned = await db.portalLink.findFirst({ where: { id, workspaceId: ctx.active.workspace.id } });
  if (!owned) return fail("Link not found");
  await db.portalLink.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/approvals");
  revalidatePath("/agency");
  return ok(undefined, "Link revoked");
}

/** Resolve a bearer token to its still-valid workspace, or null. */
export async function resolvePortalToken(token: string) {
  if (!/^port_[a-f0-9]{20,64}$/.test(token)) return null;
  const link = await db.portalLink.findUnique({
    where: { token },
    select: {
      id: true,
      label: true,
      workspaceId: true,
      logoUrl: true,
      primaryColor: true,
      expiresAt: true,
      revokedAt: true,
      workspace: { select: { id: true, name: true, clientName: true } },
    },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt.getTime() < Date.now())) return null;
  return link;
}

type PortalDecision = "approve" | "request_changes";

export async function portalDecideApprovalAction(
  token: string,
  requestId: string,
  decision: PortalDecision,
  comment?: string,
  reasonCategory?: string,
) {
  // Unauthenticated bearer endpoint: per-link rate limit so a leaked token
  // can't be hammered (or a valid one brute-forced at speed).
  try {
    await enforceRateLimit(`portal-decide:${token.slice(0, 32)}`, 20, 60_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail("Too many attempts — slow down and try again");
    throw e;
  }
  const link = await resolvePortalToken(token);
  if (!link) return fail("This link is no longer valid");

  const req = await db.approvalRequest.findUnique({
    where: { id: requestId },
    include: { flow: { include: { stages: { orderBy: { order: "asc" } } } }, post: true },
  });
  if (!req || req.post.workspaceId !== link.workspaceId) return fail("Not found");
  if (req.status !== "in_review" && req.status !== "changes_requested") return fail("This request is already closed");

  const stage = req.flow.stages[req.currentStage];
  // The one access-control check that matters here: a portal link can only
  // act at a stage an admin explicitly gated to "client" — see module doc.
  if (!stage || stage.roleGate !== "client") return fail("Not awaiting client review right now");

  await db.approvalAction.create({
    data: {
      requestId,
      stageId: stage.id,
      actorLabel: `${link.label} (client portal)`,
      action: decision,
      reasonCategory: decision === "request_changes" ? reasonCategory?.trim() || null : null,
      comment: comment?.trim() || null,
    },
  });

  if (decision === "request_changes") {
    await db.approvalRequest.update({ where: { id: requestId }, data: { status: "changes_requested", escalatedAt: null } });
    await db.post.update({ where: { id: req.postId }, data: { status: "draft" } });
    await notifyWorkspace(req.post.workspaceId, {
      type: "approval_request",
      title: "Client requested changes",
      body: `"${req.post.title ?? "Untitled post"}": ${comment?.trim() || "see comments"}`,
      linkUrl: `/composer/${req.postId}`,
    });
  } else {
    const isFinal = req.currentStage >= req.flow.stages.length - 1;
    if (isFinal) {
      await db.approvalRequest.update({ where: { id: requestId }, data: { status: "approved" } });
      await db.post.update({ where: { id: req.postId }, data: { status: "approved" } });
      await notifyWorkspace(req.post.workspaceId, {
        type: "approval_request",
        title: "Client approved",
        body: `"${req.post.title ?? "Untitled post"}" is approved and ready to schedule.`,
        linkUrl: `/composer/${req.postId}`,
      });
    } else {
      await db.approvalRequest.update({ where: { id: requestId }, data: { currentStage: req.currentStage + 1, escalatedAt: null, stageEnteredAt: new Date() } });
      await notifyWorkspace(req.post.workspaceId, {
        type: "approval_request",
        title: "Client approved — advanced to next stage",
        body: `"${req.post.title ?? "Untitled post"}" cleared client review.`,
        linkUrl: "/approvals",
      });
    }
  }

  await logActivity({
    workspaceId: req.post.workspaceId,
    verb: decision === "approve" ? "approved" : "requested_changes",
    entityType: "post",
    entityId: req.postId,
    summary: `Client (${link.label}) ${decision === "approve" ? "approved" : "requested changes to"} "${req.post.title ?? "Untitled post"}"`,
  });

  return ok(undefined, decision === "approve" ? "Approved" : "Changes requested");
}
