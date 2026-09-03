import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NAV } from "@/lib/nav";
import { orgEntitlements } from "@/lib/entitlements";
import { AppShell } from "@/components/shell/app-shell";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { OfflineBanner } from "@/components/offline-banner";
import { getSettings } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;
  const role = ctx.active.role;

  const settings = await getSettings();
  if (settings.maintenanceMode && !ctx.user.isPlatformAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg)] px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-[22px] font-bold text-[var(--text)]">We&apos;ll be right back</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">{settings.maintenanceMessage}</p>
        </div>
      </div>
    );
  }

  const [pendingApprovals, openInbox, notifications, unread] = await Promise.all([
    db.approvalRequest.count({
      where: { post: { workspaceId: wsId }, status: { in: ["in_review", "changes_requested"] } },
    }),
    db.conversation.count({ where: { workspaceId: wsId, status: "open" } }),
    db.notification.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.notification.count({ where: { userId: ctx.user.id, readAt: null } }),
  ]);

  // Filter nav by resolved role permissions AND the org's plan entitlements.
  const entitled = await orgEntitlements(ctx.active.org.id);
  const perms = new Set(ctx.active.permissions);
  const nav = NAV.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => (!i.permission || perms.has(i.permission)) && (!i.entitlement || entitled.has(i.entitlement)),
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <AppShell
      nav={nav}
      badges={{ approvals: pendingApprovals, inbox: openInbox, notifications: unread }}
      workspaces={ctx.workspaces.map((w) => ({
        id: w.workspace.id,
        name: w.workspace.name,
        kind: w.workspace.kind,
        clientName: w.workspace.clientName,
      }))}
      activeWorkspaceId={wsId}
      orgName={ctx.active.org.name}
      canAgency={can(role, "agency.manage") && ctx.active.org.type === "agency"}
      user={{
        name: ctx.user.name,
        email: ctx.user.email,
        image: ctx.user.image,
        isPlatformAdmin: ctx.user.isPlatformAdmin,
      }}
      notifications={notifications}
      unread={unread}
      banner={
        <>
          <OfflineBanner />
          <AnnouncementBanner />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
