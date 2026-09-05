import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { UserAdminToggle, UserRowActions } from "../admin-client";
import { AdminToolbar, Pagination, SortHeader } from "../_controls";
import { ImportUsersButton } from "./users-client";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseAdminQuery(raw, {
    defaultSort: "createdAt",
    sortable: ["createdAt", "name", "email"],
    filterKeys: ["status", "verified", "admin"],
  });

  const where: Prisma.UserWhereInput = {};
  if (query.q) {
    where.OR = [
      { email: { contains: query.q, mode: "insensitive" } },
      { name: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.filters.status === "suspended") where.suspendedAt = { not: null };
  if (query.filters.status === "active") where.suspendedAt = null;
  if (query.filters.status === "deleted") where.deletedAt = { not: null };
  if (query.filters.verified === "yes") where.emailVerified = { not: null };
  if (query.filters.verified === "no") where.emailVerified = null;
  if (query.filters.admin === "yes") where.isPlatformAdmin = true;

  const [users, total] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--text)]">Users</h1>

      <AdminToolbar
        searchPlaceholder="Search name or email…"
        exportType="users"
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
              <TD><UserAdminToggle userId={u.id} isAdmin={u.isPlatformAdmin} /></TD>
              <TD><UserRowActions userId={u.id} suspended={!!u.suspendedAt} verified={!!u.emailVerified} /></TD>
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
