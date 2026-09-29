import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatCurrency } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { AdminToolbar, Pagination } from "../_controls";
import {
  ApplicationActions,
  StatusActions,
  ApproveCommissionButton,
  CreatePayoutButton,
  MarkPayoutPaidButton,
} from "./affiliates-client";

export const metadata: Metadata = { title: "Admin · Affiliates" };

export default async function AdminAffiliatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseAdminQuery(raw, {
    defaultSort: "createdAt",
    sortable: ["createdAt"],
    filterKeys: ["applicationStatus", "status"],
  });
  const where = {
    ...(query.filters.applicationStatus ? { applicationStatus: query.filters.applicationStatus } : {}),
    ...(query.filters.status ? { status: query.filters.status } : {}),
  };

  const [settings, affiliates, total, commissionAgg, pendingCommissions, payoutsRequested] = await Promise.all([
    getSettings(),
    db.affiliate.findMany({
      where,
      orderBy: { createdAt: query.dir },
      skip: query.skip,
      take: query.perPage,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.affiliate.count({ where }),
    db.affiliateCommission.groupBy({ by: ["status"], _sum: { amountMinor: true }, _count: true }),
    db.affiliateCommission.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { affiliate: { include: { user: { select: { name: true, email: true } } } } },
    }),
    db.affiliatePayout.findMany({
      where: { status: "requested" },
      orderBy: { requestedAt: "asc" },
      include: { affiliate: { include: { user: { select: { name: true, email: true } } } } },
    }),
  ]);

  const sums = Object.fromEntries(commissionAgg.map((c) => [c.status, { total: c._sum.amountMinor ?? 0, count: c._count }]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Affiliate Program</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Program is <strong>{settings.affiliateEnabled ? "on" : "off"}</strong> · default{" "}
          <strong>{settings.affiliateDefaultCommissionType.replace("_", " ")}</strong> at{" "}
          <strong>
            {settings.affiliateDefaultCommissionType.startsWith("percent")
              ? `${settings.affiliateDefaultCommissionRate}%`
              : formatCurrency(settings.affiliateDefaultFixedAmount)}
          </strong>{" "}
          · applications {settings.affiliateApplicationRequired ? "require review" : "auto-approve"}. Runs alongside the
          legacy Referrals program — edit defaults in Site Settings.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Affiliates" value={total} />
        <Stat label="Pending commissions" value={sums.pending?.count ?? 0} money={sums.pending?.total ?? 0} />
        <Stat label="Approved (awaiting payout)" value={sums.approved?.count ?? 0} money={sums.approved?.total ?? 0} />
        <Stat label="Paid out" value={sums.paid?.count ?? 0} money={sums.paid?.total ?? 0} />
      </div>

      {payoutsRequested.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="mb-1 text-[13px] font-semibold text-[var(--text)]">Payout batches awaiting confirmation</p>
            <p className="text-[12px] text-[var(--text-subtle)]">
              Marking paid only updates this record — send the money through your real payout method first.
            </p>
            <ul className="divide-y divide-[var(--border)]">
              {payoutsRequested.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                  <span className="text-[var(--text)]">
                    {p.affiliate.user.name} — {formatCurrency(p.amountMinor, p.currency)}
                  </span>
                  <MarkPayoutPaidButton id={p.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {pendingCommissions.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="mb-1 text-[13px] font-semibold text-[var(--text)]">Pending commissions</p>
            <ul className="divide-y divide-[var(--border)]">
              {pendingCommissions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                  <span className="text-[var(--text)]">
                    {c.affiliate.user.name} — {formatCurrency(c.amountMinor, c.currency)}
                  </span>
                  <ApproveCommissionButton id={c.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AdminToolbar
        searchPlaceholder="(search n/a — filter by status)"
        exportType="affiliates"
        filters={[
          {
            key: "applicationStatus",
            label: "Application",
            options: [
              { value: "pending_review", label: "pending review" },
              { value: "approved", label: "approved" },
              { value: "rejected", label: "rejected" },
            ],
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "active", label: "active" },
              { value: "suspended", label: "suspended" },
              { value: "terminated", label: "terminated" },
            ],
          },
        ]}
      />

      <Table>
        <THead>
          <TR>
            <TH>Affiliate</TH>
            <TH>Code</TH>
            <TH>Commission</TH>
            <TH>Application</TH>
            <TH>Status</TH>
            <TH>When</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <tbody>
          {affiliates.map((a) => (
            <TR key={a.id}>
              <TD>
                <p className="font-medium text-[var(--text)]">{a.user.name}</p>
                <p className="text-[12px] text-[var(--text-subtle)]">{a.user.email}</p>
              </TD>
              <TD className="font-mono text-[13px] text-[var(--text)]">{a.affiliateCode}</TD>
              <TD className="text-[13px] text-[var(--text-muted)]">
                {a.commissionType.startsWith("percent") ? `${a.commissionRate}%` : formatCurrency(a.commissionFixedAmount, a.currency)}{" "}
                {a.commissionType.includes("recurring") ? `× ${a.recurringMonths}mo` : "(once)"}
              </TD>
              <TD>
                <Badge tone={a.applicationStatus === "approved" ? "success" : a.applicationStatus === "rejected" ? "danger" : "neutral"}>
                  {a.applicationStatus.replace("_", " ")}
                </Badge>
              </TD>
              <TD>
                <Badge tone={a.status === "active" ? "success" : a.status === "suspended" ? "warning" : "danger"}>{a.status}</Badge>
              </TD>
              <TD className="text-[var(--text-subtle)]">{formatDate(a.createdAt)}</TD>
              <TD>
                <div className="flex flex-col gap-1.5">
                  <ApplicationActions id={a.id} applicationStatus={a.applicationStatus} />
                  {a.applicationStatus === "approved" && (
                    <>
                      <StatusActions id={a.id} status={a.status} />
                      <CreatePayoutButton affiliateId={a.id} />
                    </>
                  )}
                </div>
              </TD>
            </TR>
          ))}
          {affiliates.length === 0 && (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-[var(--text-subtle)]">
                No affiliates match.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>

      <Pagination page={query.page} perPage={query.perPage} total={total} />
    </div>
  );
}

function Stat({ label, value, money }: { label: string; value: number; money?: number }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1 text-[22px] font-extrabold text-[var(--text)]">{value.toLocaleString()}</p>
      {money !== undefined && <p className="text-[13px] text-[var(--text-muted)]">{formatCurrency(money)}</p>}
    </div>
  );
}
