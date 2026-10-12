import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { permissionSet, effectiveRole, canOpenWorkspace } from "@/lib/rbac";
import { CUSTOM_PREFIX, isSuperAdmin, landingFor, resolvePermissions, type AdminPermission } from "@/lib/admin-permissions";

import { verifyImpersonationToken, IMPERSONATION_COOKIE } from "@/lib/impersonation";

export const WS_COOKIE = "mps_ws";
export const ORG_COOKIE = "mps_org";

export const getRealAdminUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      isPlatformAdmin: true,
      platformRole: true,
      suspendedAt: true,
      deletedAt: true,
    },
  });
  if (!user || user.suspendedAt || user.deletedAt || !user.isPlatformAdmin) return null;
  return user;
});

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      emailVerified: true,
      isPlatformAdmin: true,
      platformRole: true,
      twoFactorEnabled: true,
      timezone: true,
      locale: true,
      suspendedAt: true,
      deletedAt: true,
      createdAt: true,
    },
  });
  // Single choke point: every caller (requireWorkspace, withPermission,
  // requirePlatformAdmin) routes through here, so this is what makes an
  // admin's suspend/delete actually take effect — even under the JWT
  // session strategy, where the Session/Device DB rows themselves aren't
  // consulted per-request. Also closes the gap where suspension was only
  // checked in the Credentials provider's authorize(), never for Google
  // sign-in (a suspended user could otherwise keep signing in via Google).
  if (!user || user.suspendedAt || user.deletedAt) return null;

  // Safe impersonation: only a verified platform admin can assume another identity
  if (user.isPlatformAdmin) {
    const jar = await cookies();
    const token = jar.get(IMPERSONATION_COOKIE)?.value;
    if (token) {
      const imp = verifyImpersonationToken(token);
      // Starting a session is limited to unrestricted admins (actions/impersonation.ts); honour the same rule on every
      // request, so demoting an admin to a restricted tier ends a session already in progress.
      if (imp && imp.adminId === user.id && user.platformRole == null) {
        // The cookie only names a session; the row decides whether it is still alive. A session that was ended, has
        // expired or is for someone else stops working at once, whatever the cookie says.
        const live = await db.impersonationSession.findUnique({
          where: { id: imp.sid },
          select: { adminId: true, targetUserId: true, mode: true, expiresAt: true, revokedAt: true },
        });
        const valid =
          !!live &&
          !live.revokedAt &&
          live.expiresAt.getTime() > Date.now() &&
          live.adminId === user.id &&
          live.targetUserId === imp.targetUserId;
        if (!valid) {
          return { ...user, isImpersonated: false, impersonatorAdmin: null as { id: string; name: string; email: string } | null, impersonationMode: null as "view" | "edit" | null };
        }
        const target = await db.user.findUnique({
          where: { id: imp.targetUserId },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            emailVerified: true,
            isPlatformAdmin: true,
            platformRole: true,
            twoFactorEnabled: true,
            timezone: true,
            locale: true,
            suspendedAt: true,
            deletedAt: true,
            createdAt: true,
          },
        });
        if (target && !target.suspendedAt && !target.deletedAt && !target.isPlatformAdmin) {
          return {
            ...target,
            isImpersonated: true,
            impersonatorAdmin: { id: user.id, name: user.name, email: user.email },
            impersonationMode: (live.mode === "edit" ? "edit" : "view") as "view" | "edit" | null,
          };
        }
      }
    }
  }

  return {
    ...user,
    isImpersonated: false,
    impersonatorAdmin: null as { id: string; name: string; email: string } | null,
    impersonationMode: null as "view" | "edit" | null,
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * What this staff member may do, resolved from their tier and any role assignments (see lib/admin-permissions.ts).
 * Empty for customers and while impersonating one. Loaded once per request.
 */
export const getStaffPermissions = cache(async (): Promise<ReadonlySet<AdminPermission>> => {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) return new Set<AdminPermission>();
  if (user.platformRole == null) return resolvePermissions(user);

  const now = new Date();
  const assignments = await db.adminRoleAssignment.findMany({
    where: { userId: user.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { roleKey: true, expiresAt: true, revokedAt: true },
  });
  const customKeys = assignments.map((x) => x.roleKey).filter((k) => k.startsWith(CUSTOM_PREFIX));
  const customRows = customKeys.length ? await db.adminCustomRole.findMany({ where: { key: { in: customKeys } }, select: { key: true, name: true, permissions: true } }) : [];
  const custom = customRows.map((r) => ({ key: r.key, name: r.name, permissions: parsePermissionList(r.permissions) }));
  return resolvePermissions(user, assignments, custom, now);
});

function parsePermissionList(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** The admin shell: any staff member who can open at least one admin area. Customers are sent to the app. */
export async function requireAdminAccess() {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/dashboard");
  const perms = await getStaffPermissions();
  if (perms.size === 0) redirect("/dashboard");
  return user;
}

/**
 * The guard for a page or action: the signed-in staff member must hold `key`. Someone who does not is sent to the
 * first admin page they can use (or the app). This runs where the work happens, because the sidebar, the edge proxy
 * and the layout only ever see page navigations: a server action is a direct POST.
 */
export async function requireAdminPermission(key: AdminPermission) {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/dashboard");
  const perms = await getStaffPermissions();
  if (!perms.has(key)) redirect(landingFor(perms) ?? "/dashboard");
  return user;
}

/** Same check for route handlers, which answer with a status code instead of redirecting. */
export async function hasAdminPermission(key: AdminPermission): Promise<boolean> {
  return (await getStaffPermissions()).has(key);
}

/**
 * Only the original, unrestricted administrators. Kept for what must never be delegated through a role:
 * managing who is an admin, roles and access, and customer impersonation.
 */
export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!isSuperAdmin(user)) {
    if (!user.isPlatformAdmin) redirect("/dashboard");
    redirect(landingFor(await getStaffPermissions()) ?? "/dashboard");
  }
  return user;
}

/** For route handlers that answer with a status code: true only for an original, unrestricted administrator. */
export function isFullPlatformAdmin<T extends { isPlatformAdmin: boolean; platformRole?: string | null }>(user: T | null | undefined): user is T {
  return isSuperAdmin(user);
}

export type WorkspaceContext = Awaited<ReturnType<typeof getWorkspaceContext>>;

export const getWorkspaceContext = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await db.membership.findMany({
    where: { userId: user.id, status: "active" },
    include: {
      customRole: true,
      org: {
        include: {
          workspaces: {
            where: { archived: false },
            orderBy: { createdAt: "asc" },
            include: { members: { where: { userId: user.id } } },
          },
          subscription: { include: { plan: true } },
        },
      },
    },
  });

  const orgs = memberships.map((m) => m.org);
  const allWorkspaces = memberships.flatMap((m) => {
    let customPerms: string[] | null = null;
    if (m.customRole) {
      try {
        const parsed = JSON.parse(m.customRole.permissions);
        if (Array.isArray(parsed)) customPerms = parsed.map(String);
      } catch {
        /* ignore */
      }
    }
    // A restricted workspace is not even listed for someone who was not added to it: it never appears in the switcher,
    // /switch and the workspace cookie cannot select it, and a stale cookie falls back to one they can open.
    return m.org.workspaces
      .filter((w) => canOpenWorkspace(m.role, w.restricted, w.members.length > 0))
      .map((w) => ({
        workspace: w,
        org: m.org,
        orgRole: m.role,
        workspaceRole: w.members[0]?.role ?? null,
        customPerms,
        customRoleName: m.customRole?.name ?? null,
      }));
  });

  if (allWorkspaces.length === 0) {
    return { user, orgs, workspaces: [], active: null };
  }

  const jar = await cookies();
  const wsId = jar.get(WS_COOKIE)?.value;
  const active =
    allWorkspaces.find((x) => x.workspace.id === wsId) ?? allWorkspaces[0];

  // Effective role: workspace-specific overrides org role.
  const role = effectiveRole(active.orgRole, active.workspaceRole);
  const permissions = [...permissionSet(role, active.customPerms)];

  return {
    user,
    orgs,
    workspaces: allWorkspaces,
    active: {
      workspace: active.workspace,
      org: active.org,
      orgRole: active.orgRole,
      role,
      roleLabel: active.customRoleName ?? role,
      permissions,
      subscription: active.org.subscription ?? null,
    },
  };
});

type Ctx = NonNullable<WorkspaceContext>;
export type ActiveContext = Omit<Ctx, "active"> & { active: NonNullable<Ctx["active"]> };

export async function requireWorkspace(): Promise<ActiveContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (!ctx.active) redirect("/onboarding");
  return ctx as ActiveContext;
}
