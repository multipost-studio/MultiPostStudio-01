import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/session";
import { ADMIN_PERMISSION_DEFS, ASSIGNABLE_PERMISSIONS, SYSTEM_ROLES, CUSTOM_PREFIX, systemRole, isSuperAdmin } from "@/lib/admin-permissions";
import { AccessClient, type RoleRow, type StaffRow } from "./access-client";

export const metadata: Metadata = { title: "Admin · Access & roles" };
export const dynamic = "force-dynamic";

function parsePerms(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default async function AdminAccessPage() {
  await requireAdminPermission("access.view");
  const now = new Date();
  const [customRoles, staff, assignments] = await Promise.all([
    db.adminCustomRole.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { isPlatformAdmin: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, platformRole: true, isPlatformAdmin: true, suspendedAt: true },
      take: 200,
    }),
    db.adminRoleAssignment.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" }, take: 1000 }),
  ]);

  const nameOf = (key: string) => systemRole(key)?.name ?? customRoles.find((r) => r.key === key)?.name ?? "Deleted role";
  const roles: RoleRow[] = [
    ...SYSTEM_ROLES.map((r) => ({ id: null, key: r.key, name: r.name, description: r.description, permissions: [...r.permissions], system: true, members: 0 })),
    ...customRoles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description ?? "", permissions: parsePerms(r.permissions), system: false, members: 0 })),
  ].map((r) => ({ ...r, members: assignments.filter((a) => a.roleKey === r.key && (!a.expiresAt || a.expiresAt > now)).length }));

  const rows: StaffRow[] = staff.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    level: isSuperAdmin(u) ? "full" : u.platformRole === "support" ? "support" : "scoped",
    suspended: !!u.suspendedAt,
    assignments: assignments
      .filter((a) => a.userId === u.id)
      .map((a) => ({ id: a.id, roleKey: a.roleKey, roleName: nameOf(a.roleKey), reason: a.reason, expiresAt: a.expiresAt?.toISOString() ?? null, expired: !!a.expiresAt && a.expiresAt <= now })),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Access &amp; roles</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-[var(--text-muted)]">
          Give staff exactly the admin access they need. Full administrators can do everything and are the only ones who can manage this page. Every change needs a reason and is written to the audit log.
        </p>
      </div>
      <AccessClient
        staff={rows}
        roles={roles}
        permissions={ADMIN_PERMISSION_DEFS.filter((d) => (ASSIGNABLE_PERMISSIONS as readonly string[]).includes(d.key)).map((d) => ({ key: d.key, label: d.label, module: d.module, sensitive: !!d.sensitive }))}
        customPrefix={CUSTOM_PREFIX}
      />
    </div>
  );
}
