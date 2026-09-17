"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ORG_ROLES, WORKSPACE_ROLES } from "@/lib/constants";
import { PERMISSIONS } from "@/lib/rbac";
import { logAudit, notify } from "@/lib/events";
import { withPermission, entitlementGuard, limitGuard, ok, fail } from "./_helpers";
import { sendInviteEmail } from "@/lib/adapters/email";
import { bumpUsage, debumpUsage } from "@/lib/adapters/billing";
import { logger } from "@/lib/logger";

const PERM_KEYS = new Set<string>(PERMISSIONS);

// Roles whose grant is itself privileged: handing one out is a vertical
// move, so only owners/admins may do it. Everyone with members.manage can
// still invite/assign the non-privileged roles.
function canGrantRole(actorOrgRole: string, targetOrgRole: string): boolean {
  if (targetOrgRole === "owner") return actorOrgRole === "owner";
  if (targetOrgRole === "admin") return actorOrgRole === "owner" || actorOrgRole === "admin";
  return true;
}

// Permissions that must never be minted via custom roles. admin.platform is
// currently inert (platform gates check isPlatformAdmin, not the permission),
// but leaving it grantable builds a latent escalation for the day someone
// checks it. members.manage/billing.manage let a custom role re-grant itself.
const UNGRANTABLE_PERMS = new Set(["admin.platform"]);

function sanitizeCustomPerms(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  return [...new Set(list.map(String).filter((p) => PERM_KEYS.has(p) && !UNGRANTABLE_PERMS.has(p)))];
}

// Custom-role permissions that escalate toward org takeover. Assigning a
// role containing any of these requires owner/admin, same as granting admin.
const PRIVILEGED_CUSTOM_PERMS = new Set(["members.manage", "billing.manage", "integrations.manage"]);

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
  if (!canGrantRole(ctx.active.orgRole, parsed.data.orgRole)) {
    return fail("Only owners and admins can invite admins");
  }

  const orgId = ctx.active.org.id;
  const memberCount = await db.membership.count({ where: { orgId } });
  const lim = await limitGuard(orgId, "maxUsers", memberCount, "team members");
  if (lim) return lim;

  let user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const isNewAccount = !user;
  if (!user) {
    // Pending account with an unguessable placeholder password — the invitee
    // sets a real one via password reset. Must be crypto-random, NOT
    // Math.random(): V8's PRNG is predictable from observed output, so a
    // guessable placeholder would let an attacker sign in as the invitee
    // before they ever complete setup.
    user = await db.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash: await bcrypt.hash(randomBytes(32).toString("base64url"), 10),
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
  await bumpUsage(orgId, "users");
  await db.workspaceMember.create({
    data: { workspaceId: ctx.active.workspace.id, userId: user.id, role: "editor" },
  });
  await notify({
    userId: user.id,
    type: "system",
    title: `You've been added to ${ctx.active.org.name}`,
    body: `${ctx.user.name} invited you as ${parsed.data.orgRole}.`,
    // Switch the invitee into the workspace they were just added to, THEN show
    // the team. Linking straight to /team rendered whichever workspace their
    // cookie already pointed at — usually their own — so the invite looked
    // like it had done nothing. /switch verifies membership before setting it.
    linkUrl: `/switch?ws=${ctx.active.workspace.id}&next=%2Fteam`,
  });
  // Email the invitation. Without this an invited person is locked out: the
  // account above has a random placeholder password they never see, and the
  // in-app notification lives behind the login they cannot pass. A new account
  // gets a password-set link; an existing one just gets told where they were
  // added. Failure is logged, not surfaced — the membership is already created.
  let inviteToken: string | undefined;
  if (isNewAccount) {
    inviteToken = randomBytes(24).toString("hex");
    await db.verificationToken.create({
      data: {
        identifier: parsed.data.email,
        token: inviteToken,
        // Reuses the existing /reset flow rather than inventing a second
        // token type. 7 days, not the 1h of a self-service reset — an invite
        // may sit unread over a weekend.
        purpose: "password_reset",
        expires: new Date(Date.now() + 7 * 24 * 3_600_000),
      },
    });
  }
  sendInviteEmail({
    to: parsed.data.email,
    name: parsed.data.name,
    orgName: ctx.active.org.name,
    inviterName: ctx.user.name,
    role: parsed.data.orgRole,
    token: inviteToken,
    // Existing accounts land straight in the new workspace; /switch redirects
    // through login first if their session has expired.
    landingPath: `/switch?ws=${ctx.active.workspace.id}&next=%2Fteam`,
  }).catch((e) => logger.error({ err: e, email: parsed.data.email }, "invite email failed"));

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
  if (!canGrantRole(ctx.active.orgRole, orgRole)) {
    return fail("Only owners and admins can grant that role");
  }
  await db.membership.update({ where: { id: m.id }, data: { role: orgRole } });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "member.role_changed", targetType: "user", targetId: userId, metadata: { role: orgRole } });
  revalidatePath("/team");
  return ok(undefined, "Role updated");
}

/* ---------------- custom roles ---------------- */

export async function createCustomRoleAction(input: { name: string; permissions: string[] }) {
  const ctx = await withPermission("members.manage");
  // Custom roles are a Team-tier feature ("roles_permissions").
  const notEntitled = await entitlementGuard(ctx.active.org.id, "roles_permissions", "Custom roles");
  if (notEntitled) return notEntitled;
  const name = String(input.name).trim().slice(0, 60);
  if (!name) return fail("Name the role");
  const perms = sanitizeCustomPerms(input.permissions);
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
    data.permissions = JSON.stringify(sanitizeCustomPerms(input.permissions));
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
    let rolePerms: string[] = [];
    try {
      const parsed = JSON.parse(role.permissions);
      if (Array.isArray(parsed)) rolePerms = parsed.map(String);
    } catch {
      /* treat unparseable as unprivileged */
    }
    if (rolePerms.some((p) => PRIVILEGED_CUSTOM_PERMS.has(p))) {
      const actor = ctx.active.orgRole;
      if (actor !== "owner" && actor !== "admin") {
        return fail("Only owners and admins can assign that role");
      }
    }
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
  await debumpUsage(ctx.active.org.id, "users");
  await db.workspaceMember.deleteMany({ where: { userId, workspace: { orgId: ctx.active.org.id } } });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "member.removed", targetType: "user", targetId: userId });
  revalidatePath("/team");
  return ok(undefined, "Member removed");
}
