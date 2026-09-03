import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { UserAdminToggle, UserRowActions } from "../admin-client";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsersPage() {
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { memberships: true } } },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--text)]">Users ({users.length})</h1>
      <Table>
        <THead>
          <TR>
            <TH>User</TH>
            <TH>Orgs</TH>
            <TH>Verified</TH>
            <TH>Joined</TH>
            <TH>Admin</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <tbody>
          {users.map((u) => (
            <TR key={u.id}>
              <TD>
                <div className="flex items-center gap-2">
                  <Avatar name={u.name} src={u.image} size={26} />
                  <div>
                    <p className="font-medium text-[var(--text)]">
                      {u.name}
                      {u.suspendedAt && <Badge tone="danger" className="ml-2">suspended</Badge>}
                      {u.deletedAt && <Badge tone="neutral" className="ml-2">deleted</Badge>}
                    </p>
                    <p className="text-[12px] text-[var(--text-subtle)]">{u.email}</p>
                  </div>
                </div>
              </TD>
              <TD className="tabular-nums">{u._count.memberships}</TD>
              <TD>
                {u.emailVerified ? <Badge tone="success">verified</Badge> : <Badge tone="warning">pending</Badge>}
              </TD>
              <TD className="text-[var(--text-subtle)]">{formatDate(u.createdAt)}</TD>
              <TD>
                <UserAdminToggle userId={u.id} isAdmin={u.isPlatformAdmin} />
              </TD>
              <TD>
                <UserRowActions userId={u.id} suspended={!!u.suspendedAt} verified={!!u.emailVerified} />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
