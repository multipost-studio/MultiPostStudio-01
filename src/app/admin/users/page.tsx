import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Avatar, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { UserAdminToggle, UserRowActions } from "../admin-client";
import { AdminToolbar, Pagination, SortHeader } from "../_controls";
import { ImportUsersButton } from "./users-client";
import { usersQueryOpts, usersWhere } from "@/lib/admin-exports/accounts";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseAdminQuery(raw, usersQueryOpts);
  const where = usersWhere(query);

  const [users, total, platformTotal, suspendedCount, unverifiedCount, adminCount] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      skip: query.skip,
      take: query.perPage,
      // Explicit select — this list never needs passwordHash / twoFactorSecret /
      // twoFactorEnabled, so don't pull them into the page-data object at all.
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isPlatformAdmin: true,
        emailVerified: true,
        suspendedAt: true,
        deletedAt: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    }),
    db.user.count({ where }),
    // Unfiltered platform-wide counts for the stat row — independent of
    // whatever the table below is currently filtered/searched to, so the
    // numbers stay a constant reference point while browsing.
    db.user.count(),
    db.user.count({ where: { suspendedAt: { not: null } } }),
    db.user.count({ where: { emailVerified: null } }),
    db.user.count({ where: { isPlatformAdmin: true } }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Users</h1>
        <p className="mt-0.5 text-[14px] text-[var(--text-muted)]">Every account on the platform, across every organization.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Total users" value={platformTotal} />
        <Stat label="Suspended" value={suspendedCount} />
        <Stat label="Unverified" value={unverifiedCount} />
        <Stat label="Platform admins" value={adminCount} />
      </div>

      <AdminToolbar
        searchPlaceholder="Search name or email…"
        exportType="users"
        dateRange
        filters={[
          { key: "status", label: "Status", options: [
            { value: "active", label: "active" },
            { value: "suspended", label: "suspended" },
            { value: "deleted", label: "deleted" },
          ] },
          { key: "verified", label: "Verified", options: [
            { value: "yes", label: "yes" },
            { value: "no", label: "no" },
          ] },
          { key: "admin", label: "Admin", options: [{ value: "yes", label: "yes" }] },
        ]}
      >
        <ImportUsersButton />
      </AdminToolbar>

      <Table>
        <THead>
          <TR>
            <TH><SortHeader field="name" label="User" /></TH>
            <TH>Orgs</TH>
            <TH>Verified</TH>
            <TH><SortHeader field="createdAt" label="Joined" /></TH>
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
                      <Link href={`/admin/users/${u.id}`} className="hover:underline">
                        {u.name}
                      </Link>
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
              <TD><UserAdminToggle userId={u.id} isAdmin={u.isPlatformAdmin} /></TD>
              <TD>
                <UserRowActions
                  userId={u.id}
                  suspended={!!u.suspendedAt}
                  verified={!!u.emailVerified}
                  isPlatformAdmin={u.isPlatformAdmin}
                />
              </TD>
            </TR>
          ))}
          {users.length === 0 && (
            <TR><TD colSpan={6} className="py-8 text-center text-[var(--text-subtle)]">No users match.</TD></TR>
          )}
        </tbody>
      </Table>

      <Pagination page={query.page} perPage={query.perPage} total={total} />
    </div>
  );
}
