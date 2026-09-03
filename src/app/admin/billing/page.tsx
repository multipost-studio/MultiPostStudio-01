import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/misc";
import { formatCurrency, formatDate } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { AdminToolbar, Pagination } from "../_controls";
import { InvoiceActions, SubStatusSelect, NewCouponButton, CouponRow } from "../_more-client";

export const metadata: Metadata = { title: "Admin · Billing" };

const MONTH_MS = 30 * 86_400_000;

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseAdminQuery(raw, { defaultSort: "createdAt", sortable: ["createdAt"], filterKeys: ["status"] });

  const invWhere: Prisma.InvoiceWhereInput = {};
  if (query.filters.status) invWhere.status = query.filters.status;
  if (query.q) invWhere.OR = [{ number: { contains: query.q, mode: "insensitive" } }, { org: { name: { contains: query.q, mode: "insensitive" } } }];

  const since = new Date(Date.now() - MONTH_MS);
  const [invoices, invTotal, paidAgg, openAgg, subs, activeSubs, subByStatus] = await Promise.all([
    db.invoice.findMany({
      where: invWhere,
      orderBy: { createdAt: query.dir },
      skip: query.skip,
      take: query.perPage,
      include: { org: { select: { name: true, slug: true } } },
    }),
    db.invoice.count({ where: invWhere }),
    db.invoice.aggregate({ _sum: { amountDue: true }, where: { status: "paid", createdAt: { gte: since } } }),
    db.invoice.aggregate({ _sum: { amountDue: true }, _count: true, where: { status: "open" } }),
    db.subscription.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { org: { select: { name: true, slug: true } }, plan: { select: { name: true, priceMonthly: true, priceAnnual: true } } },
    }),
    db.subscription.count({ where: { status: "active" } }),
    db.subscription.groupBy({ by: ["status"], _count: true }),
  ]);

  const coupons = await db.coupon.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { redemptions: true } } },
  });

  const mrr = subs
    .filter((s) => s.status === "active" || s.status === "trialing")
    .reduce((sum, s) => sum + (s.interval === "year" ? Math.round(s.plan.priceAnnual / 12) : s.plan.priceMonthly), 0);
  const statusCounts = Object.fromEntries(subByStatus.map((s) => [s.status, s._count]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Billing &amp; revenue</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">Invoices and subscriptions across every organization.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Est. MRR" value={formatCurrency(mrr)} />
        <Stat label="Active subs" value={activeSubs} />
        <Stat label="Paid · 30d" value={formatCurrency(paidAgg._sum.amountDue ?? 0)} />
        <Stat label="Open invoices" value={openAgg._count} />
        <Stat label="Open amount" value={formatCurrency(openAgg._sum.amountDue ?? 0)} />
      </div>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Subscriptions</h2>
        <div className="flex flex-wrap gap-1.5">
          {["trialing", "active", "past_due", "canceled"].map((s) => (
            <Badge key={s} tone={s === "past_due" ? "danger" : s === "active" ? "success" : "neutral"}>
              {s}: {statusCounts[s] ?? 0}
            </Badge>
          ))}
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Organization</TH>
              <TH>Plan</TH>
              <TH>Interval</TH>
              <TH>Provider</TH>
              <TH>Renews</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <tbody>
            {subs.map((s) => (
              <TR key={s.id}>
                <TD>
                  <p className="font-medium text-[var(--text)]">{s.org.name}</p>
                  <p className="text-[12px] text-[var(--text-subtle)]">{s.org.slug}</p>
                </TD>
                <TD>{s.plan.name}</TD>
                <TD className="text-[var(--text-muted)]">{s.interval}</TD>
                <TD className="text-[var(--text-muted)]">{s.provider}</TD>
                <TD className="text-[var(--text-subtle)]">{formatDate(s.currentPeriodEnd)}</TD>
                <TD><SubStatusSelect orgId={s.orgId} status={s.status} /></TD>
              </TR>
            ))}
            {subs.length === 0 && (
              <TR><TD colSpan={6} className="py-8 text-center text-[var(--text-subtle)]">No subscriptions yet.</TD></TR>
            )}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Invoices</h2>
        <AdminToolbar
          searchPlaceholder="Search invoice # or org…"
          filters={[
            { key: "status", label: "Status", options: [
              { value: "paid", label: "paid" },
              { value: "open", label: "open" },
              { value: "void", label: "void" },
            ] },
          ]}
        />
        <Table>
          <THead>
            <TR>
              <TH>Invoice</TH>
              <TH>Organization</TH>
              <TH>Amount</TH>
              <TH>Period</TH>
              <TH>Status</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <tbody>
            {invoices.map((i) => (
              <TR key={i.id}>
                <TD className="font-mono text-[13px]">{i.number}</TD>
                <TD>{i.org.name}</TD>
                <TD className="tabular-nums">{formatCurrency(i.amountDue, i.currency.toUpperCase())}</TD>
                <TD className="text-[var(--text-subtle)]">
                  {formatDate(i.periodStart)} – {formatDate(i.periodEnd)}
                </TD>
                <TD>
                  <Badge tone={i.status === "paid" ? "success" : i.status === "void" ? "neutral" : "warning"}>{i.status}</Badge>
                </TD>
                <TD><InvoiceActions id={i.id} status={i.status} /></TD>
              </TR>
            ))}
            {invoices.length === 0 && (
              <TR><TD colSpan={6} className="py-8 text-center text-[var(--text-subtle)]">No invoices match.</TD></TR>
            )}
          </tbody>
        </Table>
        <Pagination page={query.page} perPage={query.perPage} total={invTotal} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Coupons</h2>
          <NewCouponButton />
        </div>
        <p className="text-[13px] text-[var(--text-muted)]">Credit coupons — redeemed by org admins in Settings → Billing, added to their account credit.</p>
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Credit</TH>
              <TH>Redemptions</TH>
              <TH>Expires</TH>
              <TH>Active / delete</TH>
            </TR>
          </THead>
          <tbody>
            {coupons.map((c) => (
              <TR key={c.id}>
                <TD>
                  <p className="font-mono text-[13px] font-medium text-[var(--text)]">{c.code}</p>
                  {c.description && <p className="text-[12px] text-[var(--text-subtle)]">{c.description}</p>}
                </TD>
                <TD className="tabular-nums">{formatCurrency(c.amountOff, c.currency.toUpperCase())}</TD>
                <TD className="tabular-nums">
                  {c.redeemedCount}
                  {c.maxRedemptions > 0 ? ` / ${c.maxRedemptions}` : ""}
                </TD>
                <TD className="text-[var(--text-subtle)]">{c.expiresAt ? formatDate(c.expiresAt) : "—"}</TD>
                <TD><CouponRow id={c.id} active={c.active} redeemable={c._count.redemptions === 0} /></TD>
              </TR>
            ))}
            {coupons.length === 0 && (
              <TR><TD colSpan={5} className="py-8 text-center text-[var(--text-subtle)]">No coupons yet.</TD></TR>
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
