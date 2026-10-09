"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffPermissions, requirePlatformAdmin } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications/service";
import { CUSTOM_PREFIX, SYSTEM_ROLES, grantable, isSuperAdmin, systemRole } from "@/lib/admin-permissions";

/**
 * Admin roles and access. Only an original, unrestricted administrator can use any of this (requirePlatformAdmin):
 * who may manage access is never itself something a role can grant. Every change needs a written reason and leaves an
 * audit record. Role assignments are never deleted, only revoked, so the history of who had what survives.
 */

type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const reasonSchema = z.string().trim().min(8, "Give a reason (at least 8 characters)").max(300);
const roleInput = z.object({
  name: z.string().trim().min(3, "Name the role (at least 3 characters)").max(40),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(z.string().max(60)).min(1, "Pick at least one permission").max(60),
  reason: reasonSchema,
});

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input";

async function nameTaken(name: string, exceptKey?: string): Promise<boolean> {
  const lower = name.toLowerCase();
  if (SYSTEM_ROLES.some((r) => r.name.toLowerCase() === lower)) return true;
  const rows = await db.adminCustomRole.findMany({ select: { key: true, name: true } });
  return rows.some((r) => r.key !== exceptKey && r.name.toLowerCase() === lower);
}

export async function createCustomRoleAction(input: unknown): Promise<Result> {
  const admin = await requirePlatformAdmin();
  const p = roleInput.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const perms = [...new Set(p.data.permissions)];
  const g = grantable(await getStaffPermissions(), perms);
  if (!g.ok) return fail(g.reason);
  if (await nameTaken(p.data.name)) return fail("A role with that name already exists");

  const key = `${CUSTOM_PREFIX}${randomUUID().slice(0, 12)}`;
  const role = await db.adminCustomRole.create({
    data: { key, name: p.data.name, description: p.data.description || null, permissions: JSON.stringify(perms), createdById: admin.id },
  });
  await logAudit({ actorId: admin.id, action: "admin.role_created", targetType: "adminRole", targetId: role.key, metadata: { name: role.name, permissions: perms, reason: p.data.reason } });
  revalidatePath("/admin/access");
  return { ok: true, id: role.id, message: "Role created" };
}

export async function updateCustomRoleAction(id: string, input: unknown): Promise<Result> {
  const admin = await requirePlatformAdmin();
  if (typeof id !== "string" || !id) return fail("Invalid request");
  const p = roleInput.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const role = await db.adminCustomRole.findUnique({ where: { id } });
  if (!role) return fail("Role not found");
  const perms = [...new Set(p.data.permissions)];
  const g = grantable(await getStaffPermissions(), perms);
  if (!g.ok) return fail(g.reason);
  if (await nameTaken(p.data.name, role.key)) return fail("A role with that name already exists");

  await db.adminCustomRole.update({ where: { id }, data: { name: p.data.name, description: p.data.description || null, permissions: JSON.stringify(perms) } });
  await logAudit({
    actorId: admin.id,
    action: "admin.role_updated",
    targetType: "adminRole",
    targetId: role.key,
    metadata: { name: p.data.name, before: safeList(role.permissions), after: perms, reason: p.data.reason },
  });
  revalidatePath("/admin/access");
  return { ok: true, message: "Role updated" };
}

export async function deleteCustomRoleAction(id: string, reason: unknown): Promise<Result> {
  const admin = await requirePlatformAdmin();
  const r = reasonSchema.safeParse(reason);
  if (!r.success) return fail(firstError(r.error));
  if (typeof id !== "string" || !id) return fail("Invalid request");
  const role = await db.adminCustomRole.findUnique({ where: { id } });
  if (!role) return fail("Role not found");

  const now = new Date();
  const [revoked] = await db.$transaction([
    db.adminRoleAssignment.updateMany({ where: { roleKey: role.key, revokedAt: null }, data: { revokedAt: now, revokedById: admin.id } }),
    db.adminCustomRole.delete({ where: { id } }),
  ]);
  await logAudit({ actorId: admin.id, action: "admin.role_deleted", targetType: "adminRole", targetId: role.key, metadata: { name: role.name, assignmentsRevoked: revoked.count, reason: r.data } });
  revalidatePath("/admin/access");
  return { ok: true, message: "Role deleted" };
}

const assignInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter the person's account email"),
  roleKey: z.string().min(1).max(80),
  expiresInDays: z.number().int().min(1).max(365).nullish(),
  reason: reasonSchema,
});

export async function assignAdminRoleAction(input: unknown): Promise<Result> {
  const admin = await requirePlatformAdmin();
  const p = assignInput.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { email, roleKey, expiresInDays, reason } = p.data;

  const target = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isPlatformAdmin: true, platformRole: true, emailVerified: true, suspendedAt: true, deletedAt: true },
  });
  if (!target || target.deletedAt) return fail("No active account with that email");
  if (target.suspendedAt) return fail("That account is suspended");
  if (target.id === admin.id) return fail("You can't change your own access");
  if (isSuperAdmin(target)) return fail("Full administrators already have every permission. Restrict them first if you need to scope their access.");
  if (!target.emailVerified) return fail("That account hasn't verified its email yet");

  let roleName: string;
  let rolePerms: readonly string[];
  const sys = systemRole(roleKey);
  if (sys) {
    roleName = sys.name;
    rolePerms = sys.permissions;
  } else if (roleKey.startsWith(CUSTOM_PREFIX)) {
    const custom = await db.adminCustomRole.findUnique({ where: { key: roleKey } });
    if (!custom) return fail("Role not found");
    roleName = custom.name;
    rolePerms = safeList(custom.permissions);
  } else {
    return fail("Role not found");
  }
  const g = grantable(await getStaffPermissions(), rolePerms);
  if (!g.ok) return fail(g.reason);

  const now = new Date();
  const dup = await db.adminRoleAssignment.findFirst({
    where: { userId: target.id, roleKey, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true },
  });
  if (dup) return fail("They already have that role");

  const expiresAt = expiresInDays ? new Date(now.getTime() + expiresInDays * 86_400_000) : null;
  // The legacy Support tier is confined to the support desk at the edge, so adding a role means moving them to
  // role-based access and carrying their support access across as an explicit role, so nothing is lost.
  const promote = !target.isPlatformAdmin;
  const legacySupport = target.platformRole === "support";
  await db.$transaction([
    ...(promote || legacySupport ? [db.user.update({ where: { id: target.id }, data: { isPlatformAdmin: true, platformRole: "scoped" } })] : []),
    ...(legacySupport && roleKey !== "support"
      ? [db.adminRoleAssignment.create({ data: { userId: target.id, roleKey: "support", grantedById: admin.id, reason: "Carried over from the legacy Support tier" } })]
      : []),
    db.adminRoleAssignment.create({ data: { userId: target.id, roleKey, grantedById: admin.id, reason, expiresAt } }),
  ]);
  await logAudit({
    actorId: admin.id,
    action: "admin.role_assigned",
    targetType: "user",
    targetId: target.id,
    metadata: { roleKey, roleName, expiresAt: expiresAt?.toISOString() ?? null, becameStaff: promote, reason },
  });
  await createNotification({
    userId: target.id,
    type: "system",
    title: "Your admin access changed",
    body: `You were given the "${roleName}" admin role${expiresAt ? ` until ${expiresAt.toISOString().slice(0, 10)}` : ""}.`,
    noEmail: true,
  }).catch((err) => logger.warn({ err }, "role assignment notification failed"));
  revalidatePath("/admin/access");
  return { ok: true, message: `${roleName} given to ${target.email}` };
}

export async function revokeAdminRoleAction(assignmentId: string, reason: unknown): Promise<Result> {
  const admin = await requirePlatformAdmin();
  const r = reasonSchema.safeParse(reason);
  if (!r.success) return fail(firstError(r.error));
  if (typeof assignmentId !== "string" || !assignmentId) return fail("Invalid request");

  const a = await db.adminRoleAssignment.findUnique({ where: { id: assignmentId }, include: { user: { select: { id: true, email: true, platformRole: true } } } });
  if (!a || a.revokedAt) return fail("That assignment isn't active");
  const now = new Date();
  await db.adminRoleAssignment.update({ where: { id: a.id }, data: { revokedAt: now, revokedById: admin.id } });

  // A staff member who was made staff only through roles, and has none left, goes back to being an ordinary account.
  let demoted = false;
  if (a.user.platformRole === "scoped") {
    const left = await db.adminRoleAssignment.count({ where: { userId: a.userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
    if (left === 0) {
      await db.user.update({ where: { id: a.userId }, data: { isPlatformAdmin: false, platformRole: null } });
      demoted = true;
    }
  }
  await logAudit({ actorId: admin.id, action: "admin.role_revoked", targetType: "user", targetId: a.userId, metadata: { roleKey: a.roleKey, demoted, reason: r.data } });
  revalidatePath("/admin/access");
  return { ok: true, message: demoted ? "Role revoked; they no longer have admin access" : "Role revoked" };
}

function safeList(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
