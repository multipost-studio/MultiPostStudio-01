import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NAV } from "@/lib/nav";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;
  const role = ctx.active.role;

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

  // Filter nav by permission.
  const nav = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.permission || can(role, i.permission)),
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
    >
      {children}
    </AppShell>
  );
}
