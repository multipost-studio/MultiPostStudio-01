import { getStaffPermissions, requireAdminAccess } from "@/lib/session";
import { permissionForRoute } from "@/lib/admin-permissions";
import { ADMIN_NAV } from "@/lib/nav";
import { getAdminNotifications } from "@/lib/admin-notifications";
import { AdminShell } from "./admin-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Any staff member who can open at least one admin area gets the shell; every page and action re-checks its own permission.
  const admin = await requireAdminAccess();
  const perms = await getStaffPermissions();
  const navItems = ADMIN_NAV.filter((i) => {
    const key = permissionForRoute(i.href);
    return key ? perms.has(key) : false;
  });
  const { modules, totalUnread, topPriority } = await getAdminNotifications(admin.id);

  return (
    <AdminShell initial={{ modules, totalUnread, topPriority }} navItems={navItems}>
      {children}
    </AdminShell>
  );
}
