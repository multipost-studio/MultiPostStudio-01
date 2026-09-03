import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { PLAN_KEYS } from "@/lib/constants";
import { OrgSuspend, OrgRowActions } from "../admin-client";
import { AdminToolbar, Pagination, SortHeader } from "../_controls";

export const metadata: Metadata = { title: "Admin · Organizations" };

export default async function AdminOrgsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseAdminQuery(raw, {
    defaultSort: "createdAt",
    sortable: ["createdAt", "name", "type"],
    filterKeys: ["plan", "type", "deleted"],
  });

  const where: Prisma.OrganizationWhereInput = {};
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { slug: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.filters.type) where.type = query.filters.type;
  if (query.filters.deleted === "yes") where.deletedAt = { not: null };
  if (query.filters.deleted === "no") where.deletedAt = null;
  if (query.filters.plan) where.subscription = { plan: { key: query.filters.plan } };

  const [orgs, total, plans] = await Promise.all([
    db.organization.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      skip: query.skip,
      take: query.perPage,
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { memberships: true, workspaces: true } },
        memberships: { where: { status: "suspended" }, take: 1 },
      },
    }),
    db.organization.count({ where }),
    db.plan.findMany({ select: { id: true, key: true } }),
  ]);
  const keyById = Object.fromEntries(plans.map((p) => [p.id, p.key]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--text)]">Organizations</h1>

      <AdminToolbar
        searchPlaceholder="Search name or slug…"
        exportType="orgs"
        filters={[
          { key: "plan", label: "Plan", options: PLAN_KEYS.map((k) => ({ value: k, label: k })) },
          { key: "type", label: "Type", options: ["creator", "business", "agency", "marketing_team", "enterprise"].map((t) => ({ value: t, label: t })) },
          { key: "deleted", label: "Deleted", options: [{ value: "yes", label: "yes" }, { value: "no", label: "no" }] },
        ]}
      />

      <Table>
        <THead>
          <TR>
            <TH><SortHeader field="name" label="Organization" /></TH>
            <TH><SortHeader field="type" label="Type" /></TH>
            <TH>Plan</TH>
            <TH>Members</TH>
            <TH>Workspaces</TH>
            <TH><SortHeader field="createdAt" label="Created" /></TH>
            <TH>Suspend</TH>
            <TH>Manage</TH>
          </TR>
        </THead>
        <tbody>
          {orgs.map((o) => {
            const suspended = o.memberships.length > 0;
            return (
              <TR key={o.id}>
                <TD>
                  <p className="font-medium text-[var(--text)]">
                    {o.name}
                    {o.deletedAt && <Badge tone="neutral" className="ml-2">deleted</Badge>}
                  </p>
                  <p className="text-[12px] text-[var(--text-subtle)]">{o.slug}</p>
                </TD>
                <TD className="capitalize text-[var(--text-muted)]">{o.type.replace(/_/g, " ")}</TD>
                <TD>
                  <Badge tone={o.subscription?.status === "active" ? "success" : "neutral"}>
                    {o.subscription?.plan.name ?? "Free"}
                  </Badge>
                </TD>
                <TD className="tabular-nums">{o._count.memberships}</TD>
                <TD className="tabular-nums">{o._count.workspaces}</TD>
                <TD className="text-[var(--text-subtle)]">{formatDate(o.createdAt)}</TD>
                <TD><OrgSuspend orgId={o.id} suspended={suspended} /></TD>
                <TD><OrgRowActions orgId={o.id} planKey={keyById[o.subscription?.planId ?? ""] ?? "free"} /></TD>
              </TR>
            );
          })}
          {orgs.length === 0 && (
            <TR><TD colSpan={8} className="py-8 text-center text-[var(--text-subtle)]">No organizations match.</TD></TR>
          )}
        </tbody>
      </Table>

      <Pagination page={query.page} perPage={query.perPage} total={total} />
    </div>
  );
}
