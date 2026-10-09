import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/misc";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/revenue";
import { loadRevenueSource } from "@/lib/revenue-db";
import { parseAdminQuery } from "@/lib/admin-query";
import { AdminToolbar, Pagination } from "../_controls";
import { InvoiceActions, SubStatusSelect, NewCouponButton, CouponRow } from "../_more-client";
import { invoicesQueryOpts, invoicesWhere } from "@/lib/admin-exports/commerce";

export const metadata: Metadata = { title: "Admin · Billing" };

const MONTH_MS = 30 * 86_400_000;

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("billing.view");
  const raw = await searchParams;
  const query = parseAdminQuery(raw, invoicesQueryOpts);

  const invWhere = invoicesWhere(query);

  const since = new Date(Date.now() - MONTH_MS);
  const [invoices, invTotal, paidByCur, openByCur, subs, activeSubs, subByStatus, revenueSrc] = await Promise.all([
    db.invoice.findMany({
      where: invWhere,
      orderBy: { createdAt: query.dir },
      skip: query.skip,
      take: query.perPage,
      include: { org: { select: { name: true, slug: true } } },
    }),
    db.invoice.count({ where: invWhere }),
    // Per currency: amounts in different currencies must never be added together.
    db.invoice.groupBy({ by: ["currency"], _sum: { amountDue: true }, where: { status: "paid", createdAt: { gte: since } } }),
    db.invoice.groupBy({ by: ["currency"], _sum: { amountDue: true }, _count: true, where: { status: "open" } }),
    db.subscription.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { org: { select: { name: true, slug: true } }, plan: { select: { name: true, priceMonthly: true, priceAnnual: true } } },
    }),
    db.subscription.count({ where: { status: "active" } }),
    db.subscription.groupBy({ by: ["status"], _count: true }),
    loadRevenueSource().catch(() => ({ invoices: [], mrr: {} as Record<string, number> })),
  ]);

  // Currencies that actually appear on invoices, for the filter.
  const currencyRows = await db.invoice.groupBy({ by: ["currency"] }).catch(() => [] as { currency: string }[]);
  const currencyOptions = currencyRows.map((r) => r.currency.toUpperCase()).sort();

  const coupons = await db.coupon.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { redemptions: true } } },
  });

  // Active subscriptions only (trials are not revenue yet), each in the currency it bills in.
  const money = (byCur: Record<string, number>) =>
    Object.entries(byCur)
      .filter(([, v]) => v)
      .sort((a, b) => b[1] - a[1])
      .map(([c, v]) => formatMoney(v, c))
      .join(" · ") || formatMoney(0, "USD");
  const paidText = money(Object.fromEntries(paidByCur.map((r) => [r.currency.toUpperCase(), r._sum.amountDue ?? 0])));
  const openText = money(Object.fromEntries(openByCur.map((r) => [r.currency.toUpperCase(), r._sum.amountDue ?? 0])));
  const openCount = openByCur.reduce((n, r) => n + r._count, 0);
  const mrrText = money(revenueSrc.mrr);
  const statusCounts = Object.fromEntries(subByStatus.map((s) => [s.status, s._count]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Billing &amp; revenue</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">Invoices and subscriptions across every organization.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Est. MRR" value={mrrText} />
        <Stat label="Active subs" value={activeSubs} />
        <Stat label="Paid · 30d" value={paidText} />
        <Stat label="Open invoices" value={openCount} />
        <Stat label="Open amount" value={openText} />
      </div>
      <p className="-mt-3 text-[13px] text-[var(--text-muted)]">
        Each currency is shown on its own.{" "}
        <Link href="/admin/revenue" className="font-semibold text-[var(--primary)] hover:underline">
          Open Revenue
        </Link>{" "}
        to choose currencies, change the period, or convert everything into one currency.
      </p>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Subscriptions</h2>
          <span className="flex gap-2 text-[13px]">
            <a className="font-semibold text-[var(--primary)] hover:underline" href="/api/admin/export?dataset=subscriptions&format=csv">Export CSV</a>
            <a className="font-semibold text-[var(--primary)] hover:underline" href="/api/admin/export?dataset=subscriptions&format=json">JSON</a>
          </span>
        </div>
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
          exportType="invoices"
          dateRange
          numberRanges={[{ key: "amount", label: "Amount", step: 0.01 }]}
          filters={[
            ...(currencyOptions.length > 1 ? [{ key: "currency", label: "Currency", options: currencyOptions.map((c) => ({ value: c, label: c })) }] : []),
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
              <TH>Value</TH>
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
                <TD className="tabular-nums">
                  {c.percentOff > 0 ? `${c.percentOff}% off` : formatCurrency(c.amountOff, c.currency.toUpperCase())}
                </TD>
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
