import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NAV } from "@/lib/nav";
import { orgEntitlements, lowestPlanWithEntitlement } from "@/lib/entitlements";
import { flags } from "@/lib/env";
import { AppShell } from "@/components/shell/app-shell";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { OfflineBanner } from "@/components/offline-banner";
import { getSettings } from "@/lib/settings";
import { getWorkspaceStreak } from "@/lib/streak-service";

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

  const [pendingApprovals, openInbox, notifications, unread, streak] = await Promise.all([
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
    // Joins the batch the shell already runs. getWorkspaceStreak is
    // request-memoized, so on /dashboard this shares one query with the
    // streak card rather than hitting the database twice.
    getWorkspaceStreak(wsId, ctx.user.timezone || "UTC"),
  ]);

  // Role permissions hide an item outright — that is an access decision, and a
  // viewer has no business seeing an admin link. A missing plan entitlement is
  // different: the feature exists, this org just hasn't bought it. Those are
  // shown locked, because filtering them out made Automations and Recycling
  // look like features the product doesn't have.
  const entitled = await orgEntitlements(ctx.active.org.id);
  const perms = new Set(ctx.active.permissions);
  const nav = NAV.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => !i.permission || perms.has(i.permission))
      .map((i) => {
        if (!i.entitlement || entitled.has(i.entitlement)) return i;
        return { ...i, locked: true, lockedPlan: lowestPlanWithEntitlement(i.entitlement) ?? undefined };
      }),
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
      streak={{ current: streak.current, status: streak.status, todayScheduled: streak.todayScheduled }}
      storageEnabled={flags.realStorage}
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
