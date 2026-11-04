"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/session";
import { hasEntitlement } from "@/lib/entitlements";
import { logAudit } from "@/lib/events";
import { IMPERSONATION_BLOCKED_MESSAGE } from "@/lib/impersonation";
import { logger } from "@/lib/logger";
import { CODE_PREFIX, CODE_TTL_SEC, newSecret, sha256Hex } from "@/lib/mcp/oauth";
import { grantTargets, pickTarget } from "@/lib/mcp/consent";
import { ASSISTANT_SCOPES, parseScopeList } from "@/lib/mcp/scopes";

type Result = { ok: boolean; error?: string; redirectTo?: string };

/** Where to send the browser back to: the assistant's own address, carrying the code (or an error) and the state it gave us. */
function backTo(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

async function openRequest(id: unknown) {
  if (typeof id !== "string" || id.length > 100) return null;
  const row = await db.oAuthAuthRequest.findUnique({ where: { id }, include: { client: { select: { name: true } } } });
  // Usable once, while it is still fresh and not yet approved.
  return row && row.expiresAt > new Date() && !row.codeHash && !row.usedAt ? row : null;
}

/** The person approved: record who, where and what, and hand back the address that carries the one-time code to the assistant. */
export async function approveAiAccessAction(formData: FormData): Promise<Result> {
  const ctx = await getWorkspaceContext();
  if (!ctx) return { ok: false, error: "Your session has ended. Sign in again to continue." };
  if (ctx.user.isImpersonated) return { ok: false, error: IMPERSONATION_BLOCKED_MESSAGE };

  const row = await openRequest(formData.get("request"));
  if (!row) return { ok: false, error: "This connection request has expired. Go back to the assistant and start again." };

  const target = pickTarget(grantTargets(ctx.workspaces), formData.get("target"));
  if (!target) return { ok: false, error: "You can't connect an assistant to that workspace. Choose one you own or administer." };
  if (!(await hasEntitlement(target.orgId, "api_access"))) return { ok: false, error: "AI assistant access isn't included in this plan. Upgrade to connect an assistant." };

  const allowed = new Set<string>(ASSISTANT_SCOPES);
  const scopes = parseScopeList(formData.getAll("scopes")).filter((s) => allowed.has(s));
  if (scopes.length === 0) return { ok: false, error: "Choose at least one thing the assistant may do." };

  const code = newSecret(CODE_PREFIX);
  try {
    // Approve exactly once: a second click, or a second tab, finds the request already taken.
    const claimed = await db.oAuthAuthRequest.updateMany({
      where: { id: row.id, codeHash: null, usedAt: null },
      data: {
        userId: ctx.user.id,
        orgId: target.orgId,
        workspaceId: target.workspaceId,
        grantedScopes: JSON.stringify(scopes),
        codeHash: sha256Hex(code),
        codeExpiresAt: new Date(Date.now() + CODE_TTL_SEC * 1000),
      },
    });
    if (claimed.count !== 1) return { ok: false, error: "This connection request was already handled." };
  } catch (e) {
    logger.error({ err: e }, "approving an AI connection failed");
    return { ok: false, error: "Something went wrong. Try again." };
  }

  await logAudit({
    orgId: target.orgId,
    actorId: ctx.user.id,
    action: "ai.connected",
    targetType: "mcp",
    targetId: row.client.name,
    metadata: { client: row.client.name, workspaceId: target.workspaceId, scopes },
  }).catch((e) => logger.warn({ err: e }, "ai.connected audit failed"));

  return { ok: true, redirectTo: backTo(row.redirectUri, { code, state: row.state }) };
}

/** The person said no: tell the assistant, and discard the request. */
export async function denyAiAccessAction(requestId: string): Promise<Result> {
  const row = await openRequest(requestId);
  if (!row) return { ok: false, error: "This connection request has expired." };
  await db.oAuthAuthRequest.deleteMany({ where: { id: row.id, codeHash: null } });
  return { ok: true, redirectTo: backTo(row.redirectUri, { error: "access_denied", error_description: "The person declined.", state: row.state }) };
}

/** Disconnect an assistant: its tokens stop working at once. Only someone who could have connected it can do this. */
export async function revokeAiAppAction(tokenId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getWorkspaceContext();
  if (!ctx || !ctx.active) return { ok: false, error: "Sign in again to continue." };
  if (ctx.user.isImpersonated) return { ok: false, error: IMPERSONATION_BLOCKED_MESSAGE };
  if (typeof tokenId !== "string" || tokenId.length > 100) return { ok: false, error: "Not found" };

  const token = await db.oAuthToken.findUnique({ where: { id: tokenId }, include: { client: { select: { name: true } } } });
  // An organisation-wide connection needs organisation-level rights; a one-workspace one needs rights in that workspace (or the whole org).
  const mayManage =
    token &&
    grantTargets(ctx.workspaces).some((t) => t.orgId === token.orgId && (t.workspaceId === null || (token.workspaceId !== null && t.workspaceId === token.workspaceId)));
  if (!token || !mayManage) return { ok: false, error: "Not found" };

  await db.oAuthToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } });
  await logAudit({ orgId: token.orgId, actorId: ctx.user.id, action: "ai.disconnected", targetType: "mcp", targetId: token.client.name, metadata: { client: token.client.name } }).catch(() => undefined);
  revalidatePath("/integrations/ai");
  return { ok: true };
}
