import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { permissionSet } from "@/lib/rbac";

export const WS_COOKIE = "mps_ws";
export const ORG_COOKIE = "mps_org";

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
      twoFactorEnabled: true,
      timezone: true,
      locale: true,
      suspendedAt: true,
      deletedAt: true,
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
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/dashboard");
  return user;
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
    return m.org.workspaces.map((w) => ({
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
  const role = active.workspaceRole ?? active.orgRole;
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
