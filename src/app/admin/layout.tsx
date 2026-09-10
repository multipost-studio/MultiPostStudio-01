import { requirePlatformAdmin } from "@/lib/session";
import { ADMIN_NAV } from "@/lib/nav";
import { getAdminNotifications } from "@/lib/admin-notifications";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  const { modules, totalUnread, topPriority } = await getAdminNotifications(admin.id);

  return (
    <AdminShell initial={{ modules, totalUnread, topPriority }} navItems={ADMIN_NAV}>
      {children}
    </AdminShell>
  );
}
