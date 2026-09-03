import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { OrgSuspend, OrgRowActions } from "../admin-client";

export const metadata: Metadata = { title: "Admin · Organizations" };

export default async function AdminOrgsPage() {
  const orgs = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { memberships: true, workspaces: true } },
      memberships: { where: { status: "suspended" }, take: 1 },
    },
  });
  const plans = await db.plan.findMany({ select: { id: true, key: true } });
  const keyById = Object.fromEntries(plans.map((p) => [p.id, p.key]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--text)]">Organizations ({orgs.length})</h1>
      <Table>
        <THead>
          <TR>
            <TH>Organization</TH>
            <TH>Type</TH>
            <TH>Plan</TH>
            <TH>Members</TH>
            <TH>Workspaces</TH>
            <TH>Created</TH>
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
                  <p className="font-medium text-[var(--text)]">{o.name}</p>
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
                <TD>
                  <OrgSuspend orgId={o.id} suspended={suspended} />
                </TD>
                <TD>
                  <OrgRowActions orgId={o.id} planKey={keyById[o.subscription?.planId ?? ""] ?? "free"} />
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
