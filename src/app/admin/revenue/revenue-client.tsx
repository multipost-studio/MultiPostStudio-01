"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Download, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { Stat } from "@/components/ui/misc";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { TrendArea } from "@/components/charts";
import { cn } from "@/lib/utils";
import {
  PERIODS,
  PERIOD_LABEL,
  convertMinor,
  csvRows,
  formatMoney,
  hasRate,
  isCurrencyCode,
  normCode,
  type ConvertedTotals,
  type CurrencyRow,
  type FxRates,
  type Period,
} from "@/lib/revenue";
import { fetchLatestFxRatesAction, saveFxRatesAction } from "@/app/actions/revenue";
import { DateRangeFields } from "@/components/date-range-fields";

type Point = { label: string; value: number };

// Fixed locale + UTC so server and browser render the same text (no hydration mismatch).
const fmtSaved = (iso: string, time: boolean) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", ...(time ? { timeStyle: "short" } : {}) }) + (time ? " UTC" : "");

export type RevenueView = {
  period: Period;
  /** What the period is called on screen: a preset name or the custom dates. */
  periodLabel: string;
  /** Set when a valid custom range is applied (UTC days, YYYY-MM-DD). */
  custom: { from: string; to: string } | null;
  /** Today's UTC day from the server, the latest date a range may end on. */
  today: string;
  rangeError: string | null;
  mode: "separate" | "converted";
  display: string;
  /** Currencies that actually appear in invoices or subscriptions. */
  available: string[];
  chosen: string[];
  /** Every code that can be a display currency (available + any with a saved rate). */
  selectable: string[];
  rows: CurrencyRow[];
  totals: ConvertedTotals;
  fx: FxRates;
  separateSeries: Record<string, Point[]>;
  convertedSeries: Point[];
};

function csvText(matrix: string[][]): string {
  return matrix.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
}

export function RevenueClient({ view }: { view: RevenueView }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [customOpen, setCustomOpen] = React.useState(false);

  /** Every control writes to the URL, so any view can be bookmarked or shared. */
  function setParam(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  function toggleCurrency(c: string) {
    const set = new Set(view.chosen);
    if (set.has(c)) {
      if (set.size === 1) return; // keep at least one
      set.delete(c);
    } else set.add(c);
    const allSelected = view.available.every((a) => set.has(a));
    setParam({ currencies: allSelected ? null : view.available.filter((a) => set.has(a)).join(",") });
  }

  function exportCsv() {
    const blob = new Blob([csvText(csvRows(view.rows))], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `revenue-${view.custom ? `${view.custom.from}_to_${view.custom.to}` : view.period}-${view.chosen.join("-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const { totals, fx } = view;
  const converted = view.mode === "converted";

  return (
    <div className={cn("space-y-5 transition-opacity", pending && "opacity-70")} aria-busy={pending}>
      {view.rangeError && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px] text-[var(--text)]">{view.rangeError}</p>
      )}
      {/* ---- filters ---- */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1.5">
              <span className="block text-[13px] font-medium text-[var(--text-muted)]">Period</span>
              <Select
                value={view.custom || customOpen ? "custom" : view.period}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") {
                    setCustomOpen(true);
                    return;
                  }
                  setCustomOpen(false);
                  setParam({ period: v === "30d" ? null : v, from: null, to: null });
                }}
                size="sm"
                className="w-auto"
                aria-label="Period"
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABEL[p]}
                  </option>
                ))}
                <option value="custom">Custom range…</option>
              </Select>
            </label>

            {(view.custom || customOpen) && (
              <DateRangeFields
                from={view.custom?.from ?? ""}
                to={view.custom?.to ?? ""}
                today={view.today}
                disabled={pending}
                onApply={(from, to) => setParam({ period: "custom", from, to })}
              />
            )}

            <div className="space-y-1.5">
              <span className="block text-[13px] font-medium text-[var(--text-muted)]">View</span>
              <Segmented
                label="Currency view"
                value={view.mode}
                onChange={(v) => setParam({ mode: v })}
                options={[
                  { value: "separate", label: "Each currency" },
                  { value: "converted", label: "Converted total" },
                ]}
              />
            </div>

            {converted && (
              <label className="space-y-1.5">
                <span className="block text-[13px] font-medium text-[var(--text-muted)]">Show total in</span>
                <Select value={view.display} onChange={(e) => setParam({ display: e.target.value })} size="sm" className="w-auto" aria-label="Display currency">
                  {view.selectable.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </label>
            )}

            <Button size="sm" variant="secondary" className="ml-auto" onClick={exportCsv} disabled={view.rows.length === 0}>
              <Download size={14} aria-hidden /> Export CSV
            </Button>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-[var(--text-muted)]">Currencies to include</p>
            {view.available.length === 0 ? (
              <p className="text-[13.5px] text-[var(--text-subtle)]">No invoices or active subscriptions yet. Currencies appear here as soon as you are paid in them.</p>
            ) : (
              <div role="group" aria-label="Currencies to include" className="flex flex-wrap gap-2">
                {view.available.map((c) => {
                  const on = view.chosen.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleCurrency(c)}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold transition-[background-color,border-color,color,transform] duration-[var(--mps-dur-micro)] active:scale-95",
                        on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-subtle)]",
                      )}
                    >
                      {on && <Check size={13} aria-hidden />}
                      {c}
                    </button>
                  );
                })}
                {view.available.length > 1 && view.chosen.length !== view.available.length && (
                  <button type="button" onClick={() => setParam({ currencies: null })} className="text-[13px] font-semibold text-[var(--primary)] hover:underline">
                    Select all
                  </button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---- converted total ---- */}
      {converted && (
        <>
          {totals.missing.length > 0 && (
            <div role="alert" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2.5 text-[13.5px] text-[var(--text)]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--warning)]" aria-hidden />
              <span>
                <strong>{totals.missing.join(", ")}</strong> {totals.missing.length === 1 ? "is" : "are"} not in this total because there is no exchange rate for {totals.missing.length === 1 ? "it" : "them"}. Add{" "}
                {totals.missing.length === 1 ? "a rate" : "rates"} below, or switch to “Each currency”.
              </span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={`Paid · ${view.periodLabel.toLowerCase()}`} value={formatMoney(totals.paidMinor, totals.currency)} />
            <Stat label="Monthly recurring (active)" value={formatMoney(totals.mrrMinor, totals.currency)} />
            <Stat label="Open invoices" value={formatMoney(totals.openMinor, totals.currency)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Monthly revenue in {totals.currency}</CardTitle>
              <CardDescription>
                Paid invoices for the currencies you picked, converted at {fx.updatedAt ? `rates saved ${fmtSaved(fx.updatedAt, false)}` : "your saved rates"}. The last 12 months.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrendArea data={view.convertedSeries} dataKey="value" />
            </CardContent>
          </Card>
        </>
      )}

      {/* ---- each currency on its own ---- */}
      {!converted && view.rows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {view.rows.map((r) => (
            <Card key={r.currency}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge tone="primary">{r.currency}</Badge>
                  <CardTitle>{formatMoney(r.paidMinor, r.currency)}</CardTitle>
                </div>
                <CardDescription>
                  Paid · {view.periodLabel.toLowerCase()} · {r.paidInvoices} invoice{r.paidInvoices === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid grid-cols-2 gap-3 text-[13.5px]">
                  <div>
                    <dt className="text-[var(--text-subtle)]">Monthly recurring</dt>
                    <dd className="font-semibold tabular-nums text-[var(--text)]">{formatMoney(r.mrrMinor, r.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-subtle)]">Open invoices</dt>
                    <dd className="font-semibold tabular-nums text-[var(--text)]">
                      {formatMoney(r.openMinor, r.currency)} <span className="font-normal text-[var(--text-subtle)]">({r.openInvoices})</span>
                    </dd>
                  </div>
                </dl>
                {view.separateSeries[r.currency] && <TrendArea data={view.separateSeries[r.currency]} dataKey="value" height={170} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {view.rows.length === 0 && view.available.length > 0 && (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-8 text-center text-[14px] text-[var(--text-muted)]">Pick at least one currency above.</p>
      )}

      {/* ---- breakdown ---- */}
      {view.rows.length > 0 && (
        <Table label="Revenue by currency">
          <THead>
            <TR>
              <TH>Currency</TH>
              <TH className="text-right">Paid ({view.periodLabel.toLowerCase()})</TH>
              <TH className="text-right">Open</TH>
              <TH className="text-right">Active MRR</TH>
              {converted && <TH className="text-right">In {totals.currency}</TH>}
              {converted && <TH className="text-right">Share</TH>}
            </TR>
          </THead>
          <tbody>
            {view.rows.map((r) => {
              const inDisplay = convertMinor(r.paidMinor, r.currency, totals.currency, fx);
              const share = inDisplay != null && totals.paidMinor > 0 ? (inDisplay / totals.paidMinor) * 100 : null;
              return (
                <TR key={r.currency}>
                  <TD className="font-semibold">{r.currency}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(r.paidMinor, r.currency)}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(r.openMinor, r.currency)}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(r.mrrMinor, r.currency)}</TD>
                  {converted && (
                    <TD className="text-right tabular-nums">{inDisplay == null ? <span className="text-[var(--warning)]">no rate</span> : formatMoney(inDisplay, totals.currency)}</TD>
                  )}
                  {converted && <TD className="text-right tabular-nums text-[var(--text-muted)]">{share == null ? "—" : `${share.toFixed(1)}%`}</TD>}
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}

      <RatesCard fx={fx} available={view.available} />
    </div>
  );
}

/** Exchange rates the converted view uses. Entered by you, or pulled from a free public rates service. */
function RatesCard({ fx, available }: { fx: FxRates; available: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const codes = React.useMemo(() => [...new Set([...available, ...Object.keys(fx.rates)])].filter((c) => c !== "USD").sort(), [available, fx.rates]);
  const [values, setValues] = React.useState<Record<string, string>>(() => Object.fromEntries(codes.map((c) => [c, fx.rates[c] != null ? String(fx.rates[c]) : ""])));
  const [extra, setExtra] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "fetch" | null>(null);

  React.useEffect(() => {
    setValues(Object.fromEntries(codes.map((c) => [c, fx.rates[c] != null ? String(fx.rates[c]) : ""])));
  }, [codes, fx.rates]);

  const allCodes = Object.keys(values);

  async function save() {
    setBusy("save");
    const rates: Record<string, unknown> = {};
    for (const [c, v] of Object.entries(values)) if (v.trim() !== "") rates[c] = Number(v);
    const res = await saveFxRatesAction({ rates });
    setBusy(null);
    toast({ title: res.ok ? res.message : "Not saved", description: res.ok ? undefined : res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  async function fetchLatest() {
    setBusy("fetch");
    const res = await fetchLatestFxRatesAction(allCodes);
    setBusy(null);
    toast({ title: res.ok ? res.message : "Couldn't fetch rates", description: res.ok ? undefined : res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  function addCurrency() {
    const code = normCode(extra);
    if (!isCurrencyCode(code) || code === "USD") {
      toast({ title: "Enter a valid 3-letter currency code", description: "For example EUR, GBP or AED.", tone: "error" });
      return;
    }
    setValues((v) => ({ ...v, [code]: v[code] ?? "" }));
    setExtra("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exchange rates</CardTitle>
        <CardDescription>
          Used only by “Converted total”. Enter how many units of each currency equal <strong>1 USD</strong>. Nothing is converted for a currency without a rate.
          {fx.updatedAt ? ` Last saved ${fmtSaved(fx.updatedAt, true)}${fx.source && fx.source !== "manual" ? ` from ${fx.source}` : " by hand"}.` : " No rates saved yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {allCodes.length === 0 ? (
          <p className="text-[13.5px] text-[var(--text-muted)]">You only bill in USD so far, so there is nothing to convert. Add a currency below if you want to preview conversions.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allCodes.map((c) => (
              <label key={c} className="space-y-1">
                <span className="flex items-center justify-between text-[13px] font-medium text-[var(--text-muted)]">
                  <span>1 USD =</span>
                  {!hasRate(fx, c) && <span className="text-[var(--warning)]">needs a rate</span>}
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={values[c] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))}
                    aria-label={`Rate: how many ${c} equal 1 USD`}
                    placeholder="0.00"
                  />
                  <span className="w-10 shrink-0 text-[14px] font-semibold text-[var(--text)]">{c}</span>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={extra}
            onChange={(e) => setExtra(e.target.value.toUpperCase().slice(0, 3))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCurrency();
              }
            }}
            placeholder="Add currency (EUR)"
            aria-label="Add a currency code"
            className="w-44"
          />
          <Button size="sm" variant="secondary" onClick={addCurrency} disabled={!extra}>
            Add
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={fetchLatest} loading={busy === "fetch"} disabled={allCodes.length === 0}>
              <RefreshCw size={14} aria-hidden /> Fetch latest rates
            </Button>
            <Button size="sm" onClick={save} loading={busy === "save"}>
              Save rates
            </Button>
          </div>
        </div>
        <p className="text-[12px] text-[var(--text-subtle)]">
          “Fetch latest” uses a free public rates service (open.er-api.com) and replaces the rates for the currencies listed here. Conversions are for your reporting only; they never change what customers are charged.
        </p>
      </CardContent>
    </Card>
  );
}
