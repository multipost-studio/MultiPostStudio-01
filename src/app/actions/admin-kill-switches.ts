"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { requireAdminPermission } from "@/lib/session";
import { parseReason } from "@/lib/admin-reason";
import { KILL_KINDS, SCOPE_TYPES, invalidateKillSwitches } from "@/lib/kill-switches";
import { PLATFORMS } from "@/lib/constants";
import { AI_PROVIDER_IDS } from "@/lib/ai/providers/registry";

/**
 * Pause AI features or publishing for everyone, one organization, or one provider/platform. A pause needs a reason and
 * ends by being revoked or by its expiry; rows are never deleted, so the history stays. Takes effect within about 15
 * seconds on every server instance (the enforcement points cache the list for that long).
 */
type Result = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const MAX_ACTIVE = 50;
const MAX_HOURS = 24 * 90;

const input = z.object({
  kind: z.enum(KILL_KINDS.map((k) => k.id) as [string, ...string[]]),
  scopeType: z.enum(SCOPE_TYPES.map((s) => s.id) as [string, ...string[]]),
  scopeValue: z.string().trim().max(80).nullish(),
  expiresInHours: z.number().int().min(1).max(MAX_HOURS).nullish(),
});

export async function createKillSwitchAction(raw: unknown, reasonInput: unknown): Promise<Result> {
  const admin = await requireAdminPermission("flags.manage");
  const why = parseReason(reasonInput);
  if (!why.ok) return fail(why.error);
  const p = input.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid request");
  const { kind, scopeType } = p.data;
  let scopeValue = p.data.scopeValue?.trim() || null;

  if (scopeType === "platform") scopeValue = null;
  else if (!scopeValue) return fail(scopeType === "org" ? "Name the organization (its id or slug)" : "Pick the provider or platform");
  else if (scopeType === "org") {
    const org = await db.organization.findFirst({ where: { OR: [{ id: scopeValue }, { slug: scopeValue }] }, select: { id: true } });
    if (!org) return fail("No organization with that id or slug");
    scopeValue = org.id;
  } else {
    const allowed: string[] = kind === "ai" ? [...AI_PROVIDER_IDS] : Object.keys(PLATFORMS);
    if (!allowed.includes(scopeValue)) return fail(`Unknown ${kind === "ai" ? "AI provider" : "platform"}: ${scopeValue}`);
  }

  const now = new Date();
  const live = await db.killSwitch.findMany({
    where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { kind: true, scopeType: true, scopeValue: true },
    take: MAX_ACTIVE + 1,
  });
  if (live.length >= MAX_ACTIVE) return fail("There are too many active pauses. Lift some first.");
  if (live.some((s) => s.kind === kind && s.scopeType === scopeType && s.scopeValue === scopeValue)) return fail("That pause is already active");

  const expiresAt = p.data.expiresInHours ? new Date(now.getTime() + p.data.expiresInHours * 3_600_000) : null;
  const row = await db.killSwitch.create({ data: { kind, scopeType, scopeValue, reason: why.reason, createdById: admin.id, expiresAt }, select: { id: true } });
  invalidateKillSwitches();
  await logAudit({ actorId: admin.id, action: "admin.kill_switch_created", targetType: "kill_switch", targetId: row.id, reason: why.reason, metadata: { kind, scopeType, scopeValue, expiresAt: expiresAt?.toISOString() ?? null } });
  revalidatePath("/admin/kill-switches");
  return { ok: true, message: "Paused" };
}

export async function revokeKillSwitchAction(id: string, reasonInput: unknown): Promise<Result> {
  const admin = await requireAdminPermission("flags.manage");
  const why = parseReason(reasonInput);
  if (!why.ok) return fail(why.error);
  if (typeof id !== "string" || !id) return fail("Invalid request");
  const sw = await db.killSwitch.findUnique({ where: { id }, select: { kind: true, scopeType: true, scopeValue: true, revokedAt: true } });
  if (!sw || sw.revokedAt) return fail("That pause isn't active");
  const res = await db.killSwitch.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedById: admin.id } });
  if (res.count === 0) return fail("That pause isn't active");
  invalidateKillSwitches();
  await logAudit({ actorId: admin.id, action: "admin.kill_switch_lifted", targetType: "kill_switch", targetId: id, reason: why.reason, metadata: { kind: sw.kind, scopeType: sw.scopeType, scopeValue: sw.scopeValue } });
  revalidatePath("/admin/kill-switches");
  return { ok: true, message: "Pause lifted" };
}
