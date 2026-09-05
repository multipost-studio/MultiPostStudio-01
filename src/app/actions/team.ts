"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ORG_ROLES, WORKSPACE_ROLES } from "@/lib/constants";
import { PERMISSIONS } from "@/lib/rbac";
import { logAudit, notify } from "@/lib/events";
import { withPermission, ok, fail } from "./_helpers";

const PERM_KEYS = new Set<string>(PERMISSIONS);

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  orgRole: z.enum(ORG_ROLES),
});

export async function inviteMemberAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("members.manage");
  const parsed = inviteSchema.safeParse({
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    name: formData.get("name"),
    orgRole: formData.get("orgRole") ?? "creator",
  });
  if (!parsed.success) return fail("Check the invite details");
  if (parsed.data.orgRole === "owner") return fail("Only the current owner can transfer ownership");

  const orgId = ctx.active.org.id;

  let user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    // Create a pending account with a random password (demo: they can reset).
    user = await db.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash: await bcrypt.hash(Math.random().toString(36), 10),
        notificationPref: { create: {} },
      },
    });
  }

  const existing = await db.membership.findUnique({
    where: { orgId_userId: { orgId, userId: user.id } },
  });
  if (existing) return fail("This person is already a member");

  await db.membership.create({
    data: { orgId, userId: user.id, role: parsed.data.orgRole, status: "active", invitedEmail: parsed.data.email },
  });
  await db.workspaceMember.create({
    data: { workspaceId: ctx.active.workspace.id, userId: user.id, role: "editor" },
  });
  await notify({
    userId: user.id,
    type: "system",
    title: `You've been added to ${ctx.active.org.name}`,
    body: `${ctx.user.name} invited you as ${parsed.data.orgRole}.`,
    linkUrl: "/dashboard",
  });
  await logAudit({ orgId, actorId: ctx.user.id, action: "member.invited", targetType: "user", targetId: user.id, metadata: { role: parsed.data.orgRole } });
  revalidatePath("/team");
  return ok(undefined, `Invited ${parsed.data.name}`);
}

export async function updateMemberRoleAction(userId: string, orgRole: string) {
  const ctx = await withPermission("members.manage");
  if (!ORG_ROLES.includes(orgRole as (typeof ORG_ROLES)[number])) return fail("Invalid role");
  if (userId === ctx.user.id) return fail("You can't change your own role");
  const m = await db.membership.findUnique({ where: { orgId_userId: { orgId: ctx.active.org.id, userId } } });
  if (!m) return fail("Member not found");
  if (m.role === "owner") return fail("Can't change the owner's role");
  await db.membership.update({ where: { id: m.id }, data: { role: orgRole } });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "member.role_changed", targetType: "user", targetId: userId, metadata: { role: orgRole } });
  revalidatePath("/team");
  return ok(undefined, "Role updated");
}

/* ---------------- custom roles ---------------- */

export async function createCustomRoleAction(input: { name: string; permissions: string[] }) {
  const ctx = await withPermission("members.manage");
  const name = String(input.name).trim().slice(0, 60);
  if (!name) return fail("Name the role");
  const perms = [...new Set((input.permissions ?? []).map(String).filter((p) => PERM_KEYS.has(p)))];
  const row = await db.customRole.create({
    data: { orgId: ctx.active.org.id, name, permissions: JSON.stringify(perms) },
  });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "role.created", targetType: "custom_role", targetId: row.id, metadata: { name, perms: perms.length } });
  revalidatePath("/team");
  return ok(row.id, `Role "${name}" created`);
}

export async function updateCustomRoleAction(id: string, input: { name?: string; permissions?: string[] }) {
  const ctx = await withPermission("members.manage");
  const role = await db.customRole.findFirst({ where: { id, orgId: ctx.active.org.id } });
  if (!role) return fail("Role not found");
  const data: { name?: string; permissions?: string } = {};
  if (input.name !== undefined) data.name = String(input.name).trim().slice(0, 60) || role.name;
  if (Array.isArray(input.permissions)) {
    data.permissions = JSON.stringify([...new Set(input.permissions.map(String).filter((p) => PERM_KEYS.has(p)))]);
  }
  await db.customRole.update({ where: { id }, data });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "role.updated", targetType: "custom_role", targetId: id });
  revalidatePath("/team");
  return ok(undefined, "Role updated");
}

export async function deleteCustomRoleAction(id: string) {
  const ctx = await withPermission("members.manage");
  const role = await db.customRole.findFirst({ where: { id, orgId: ctx.active.org.id }, include: { _count: { select: { memberships: true } } } });
  if (!role) return fail("Role not found");
  await db.membership.updateMany({ where: { customRoleId: id }, data: { customRoleId: null } });
  await db.customRole.delete({ where: { id } });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "role.deleted", targetType: "custom_role", targetId: id });
  revalidatePath("/team");
  return ok(undefined, `Role deleted — ${role._count.memberships} member(s) reverted to their base role`);
}

export async function assignCustomRoleAction(userId: string, customRoleId: string | null) {
  const ctx = await withPermission("members.manage");
  if (userId === ctx.user.id) return fail("You can't change your own role");
  const m = await db.membership.findUnique({ where: { orgId_userId: { orgId: ctx.active.org.id, userId } } });
  if (!m) return fail("Member not found");
  if (m.role === "owner") return fail("The owner can't be given a custom role");
  if (customRoleId) {
    const role = await db.customRole.findFirst({ where: { id: customRoleId, orgId: ctx.active.org.id } });
    if (!role) return fail("Role not found");
  }
  await db.membership.update({ where: { id: m.id }, data: { customRoleId } });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "member.custom_role", targetType: "user", targetId: userId, metadata: { customRoleId } });
  revalidatePath("/team");
  return ok(undefined, customRoleId ? "Custom role assigned" : "Reverted to base role");
}

export async function updateWorkspaceRoleAction(userId: string, wsRole: string) {
  const ctx = await withPermission("members.manage");
  if (!WORKSPACE_ROLES.includes(wsRole as (typeof WORKSPACE_ROLES)[number])) return fail("Invalid role");
  const m = await db.membership.findUnique({ where: { orgId_userId: { orgId: ctx.active.org.id, userId } } });
  if (!m) return fail("Member not found");
  await db.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: ctx.active.workspace.id, userId } },
    create: { workspaceId: ctx.active.workspace.id, userId, role: wsRole },
    update: { role: wsRole },
  });
  revalidatePath("/team");
  return ok(undefined, "Workspace role updated");
}

export async function removeMemberAction(userId: string) {
  const ctx = await withPermission("members.manage");
  if (userId === ctx.user.id) return fail("You can't remove yourself");
  const m = await db.membership.findUnique({ where: { orgId_userId: { orgId: ctx.active.org.id, userId } } });
  if (!m) return fail("Member not found");
  if (m.role === "owner") return fail("Can't remove the owner");
  await db.membership.delete({ where: { id: m.id } });
  await db.workspaceMember.deleteMany({ where: { userId, workspace: { orgId: ctx.active.org.id } } });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "member.removed", targetType: "user", targetId: userId });
  revalidatePath("/team");
  return ok(undefined, "Member removed");
}
