import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/utils";
import { TeamTable, InviteButton } from "./team-client";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireWorkspace();
  const orgId = ctx.active.org.id;
  const canManage = can(ctx.active.role, "members.manage");

  const [memberships, wsMembers, activity] = await Promise.all([
    db.membership.findMany({
      where: { orgId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.workspaceMember.findMany({ where: { workspaceId: ctx.active.workspace.id } }),
    db.activityEvent.findMany({
      where: { workspaceId: ctx.active.workspace.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const wsRoleByUser = Object.fromEntries(wsMembers.map((m) => [m.userId, m.role]));

  return (
    <>
      <PageHeader
        title="Team"
        description="Roles, permissions and workspace access. Org roles set defaults; workspace roles override them."
        actions={canManage && <InviteButton />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Members ({memberships.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamTable
              canManage={canManage}
              currentUserId={ctx.user.id}
              members={memberships.map((m) => ({
                userId: m.user.id,
                name: m.user.name,
                email: m.user.email,
                image: m.user.image,
                orgRole: m.role,
                wsRole: wsRoleByUser[m.user.id] ?? null,
                status: m.status,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-[13px]">
              {activity.map((a) => (
                <li key={a.id} className="text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text)]">{a.actor?.name ?? "System"}</span>{" "}
                  {a.summary.toLowerCase()}
                  <span className="block text-[11px] text-[var(--text-subtle)]">{relativeTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
