import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import {
  convertRows,
  hasRate,
  monthlyConverted,
  monthlyPaidByCurrency,
  normCode,
  parseCurrencies,
  parsePeriod,
  summarizeByCurrency,
  isCurrencyCode,
} from "@/lib/revenue";
import { getFxRates, loadRevenueSource } from "@/lib/revenue-db";
import { RevenueClient, type RevenueView } from "./revenue-client";

export const metadata: Metadata = { title: "Admin · Revenue" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function AdminRevenuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPermission("billing.view");
  const raw = await searchParams;
  const period = parsePeriod(one(raw.period));

  let loadError: string | null = null;
  let src: Awaited<ReturnType<typeof loadRevenueSource>> = { invoices: [], mrr: {} };
  const fx = await getFxRates();
  try {
    src = await loadRevenueSource();
  } catch {
    loadError = "Couldn't load invoices and subscriptions right now. Try again in a moment.";
  }

  const allRows = summarizeByCurrency(src.invoices, src.mrr, period);
  const available = allRows.map((r) => r.currency);
  const chosen = parseCurrencies(one(raw.currencies), available);
  const rows = allRows.filter((r) => chosen.includes(r.currency));

  // Converted is the default only when every chosen currency can actually be converted.
  const everyRate = chosen.every((c) => hasRate(fx, c));
  const wantedMode = one(raw.mode);
  const mode: "separate" | "converted" = wantedMode === "separate" ? "separate" : wantedMode === "converted" ? "converted" : everyRate && chosen.length > 1 ? "converted" : "separate";

  const requested = normCode(one(raw.display) ?? "");
  const selectable = [...new Set([...available, ...Object.keys(fx.rates)])].sort();
  const display = isCurrencyCode(requested) && selectable.includes(requested) ? requested : available.includes("USD") ? "USD" : (chosen[0] ?? "USD");

  const totals = convertRows(rows, display, fx);
  const chosenInvoices = src.invoices.filter((i) => chosen.includes(normCode(i.currency)));
  const view: RevenueView = {
    period,
    mode,
    display,
    available,
    chosen,
    selectable,
    rows,
    totals,
    fx,
    separateSeries: Object.fromEntries(Object.entries(monthlyPaidByCurrency(chosenInvoices, 12)).map(([c, pts]) => [c, pts.map((p) => ({ label: p.label, value: p.amountMajor }))])),
    convertedSeries: monthlyConverted(chosenInvoices, chosen, display, fx, 12).map((p) => ({ label: p.label, value: p.amountMajor })),
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Revenue</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Everything you have been paid, in every currency you bill in. View each currency on its own, or convert the ones you pick into one currency using your own exchange rates.
        </p>
      </div>
      {loadError && (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">
          {loadError}
        </div>
      )}
      <RevenueClient view={view} />
    </div>
  );
}
