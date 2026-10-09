/**
 * Multi-currency revenue maths for the admin. Pure and dependency-free.
 *
 * Money is stored in MINOR units of the currency it was billed in (cents,
 * paise, …). Amounts in different currencies are NEVER added together
 * directly: they are either reported side by side, or converted through
 * admin-maintained exchange rates into one display currency. A currency with no
 * rate is excluded from a converted total and reported, rather than guessed.
 */

export type FxRates = {
  /** `rates[CODE]` = units of CODE per 1 USD. USD is always 1. */
  rates: Record<string, number>;
  /** ISO timestamp the rates were last saved. */
  updatedAt: string | null;
  source: string | null;
};

export const EMPTY_FX: FxRates = { rates: { USD: 1 }, updatedAt: null, source: null };

export const PERIODS = ["7d", "30d", "90d", "12m", "all"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "12m": "Last 12 months", all: "All time" };

export const normCode = (c: string): string => c.trim().toUpperCase();

/** How many decimal places the currency's minor unit has (USD 2, JPY 0, KWD 3). */
export function minorExponent(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: normCode(currency) }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export const toMajor = (minor: number, currency: string): number => minor / 10 ** minorExponent(currency);
export const toMinor = (major: number, currency: string): number => Math.round(major * 10 ** minorExponent(currency));

export function formatMoney(minor: number, currency: string): string {
  const code = normCode(currency);
  const locale = code === "INR" ? "en-IN" : "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(toMajor(minor, code));
  } catch {
    return `${toMajor(minor, code).toFixed(2)} ${code}`;
  }
}

export function hasRate(fx: FxRates, currency: string): boolean {
  const r = fx.rates[normCode(currency)];
  return typeof r === "number" && Number.isFinite(r) && r > 0;
}

/** Convert minor units from one currency to another via USD. Null when either rate is missing. */
export function convertMinor(minor: number, from: string, to: string, fx: FxRates): number | null {
  const f = normCode(from);
  const t = normCode(to);
  if (f === t) return minor;
  if (!hasRate(fx, f) || !hasRate(fx, t)) return null;
  const usdMajor = toMajor(minor, f) / fx.rates[f];
  return toMinor(usdMajor * fx.rates[t], t);
}

export type InvoiceRow = { amountDue: number; currency: string; status: string; createdAt: Date | string };

export type CurrencyRow = {
  currency: string;
  paidMinor: number;
  openMinor: number;
  paidInvoices: number;
  openInvoices: number;
  mrrMinor: number;
};

export function periodStart(period: Period, now = new Date()): Date | null {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : period === "12m" ? 365 : null;
  return days == null ? null : new Date(now.getTime() - days * 86_400_000);
}

export function parsePeriod(v: string | null | undefined): Period {
  return (PERIODS as readonly string[]).includes(v ?? "") ? (v as Period) : "30d";
}

/** Per-currency totals. `mrr` is keyed by currency code, in minor units. */
export function summarizeByCurrency(
  invoices: readonly InvoiceRow[],
  mrr: Record<string, number>,
  period: Period,
  now = new Date(),
  /** A custom window (inclusive); when given it replaces the preset. */
  custom?: { from: Date; to: Date } | null,
): CurrencyRow[] {
  const start = custom ? custom.from : periodStart(period, now);
  const end = custom ? custom.to : null;
  const rows = new Map<string, CurrencyRow>();
  const row = (c: string): CurrencyRow => {
    const code = normCode(c);
    let r = rows.get(code);
    if (!r) rows.set(code, (r = { currency: code, paidMinor: 0, openMinor: 0, paidInvoices: 0, openInvoices: 0, mrrMinor: 0 }));
    return r;
  };
  for (const inv of invoices) {
    const at = new Date(inv.createdAt);
    if (inv.status === "paid" && (!start || at >= start) && (!end || at <= end)) {
      const r = row(inv.currency);
      r.paidMinor += inv.amountDue;
      r.paidInvoices++;
    } else if (inv.status === "open") {
      // Open invoices are owed now, whatever their age.
      const r = row(inv.currency);
      r.openMinor += inv.amountDue;
      r.openInvoices++;
    }
  }
  for (const [c, v] of Object.entries(mrr)) if (v) row(c).mrrMinor += v;
  return [...rows.values()].sort((a, b) => b.paidMinor - a.paidMinor || a.currency.localeCompare(b.currency));
}

export type ConvertedTotals = { paidMinor: number; openMinor: number; mrrMinor: number; currency: string; missing: string[] };

/** Sum the chosen rows in one currency. Rows with no usable rate are left out and named in `missing`. */
export function convertRows(rows: readonly CurrencyRow[], display: string, fx: FxRates): ConvertedTotals {
  const out: ConvertedTotals = { paidMinor: 0, openMinor: 0, mrrMinor: 0, currency: normCode(display), missing: [] };
  for (const r of rows) {
    const paid = convertMinor(r.paidMinor, r.currency, display, fx);
    const open = convertMinor(r.openMinor, r.currency, display, fx);
    const mrr = convertMinor(r.mrrMinor, r.currency, display, fx);
    if (paid == null || open == null || mrr == null) {
      if (r.paidMinor || r.openMinor || r.mrrMinor) out.missing.push(r.currency);
      continue;
    }
    out.paidMinor += paid;
    out.openMinor += open;
    out.mrrMinor += mrr;
  }
  return out;
}

export type MonthPoint = { key: string; label: string; amountMajor: number };

/** The last `months` calendar months (UTC, oldest first), paid invoices only, per currency, in MAJOR units for charting. */
export function monthlyPaidByCurrency(invoices: readonly InvoiceRow[], months = 12, now = new Date()): Record<string, MonthPoint[]> {
  const keys: { key: string; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) });
  }
  const out: Record<string, Map<string, number>> = {};
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const d = new Date(inv.createdAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!keys.some((k) => k.key === key)) continue;
    const code = normCode(inv.currency);
    const m = (out[code] ??= new Map());
    m.set(key, (m.get(key) ?? 0) + inv.amountDue);
  }
  return Object.fromEntries(
    Object.entries(out).map(([c, m]) => [c, keys.map((k) => ({ ...k, amountMajor: toMajor(m.get(k.key) ?? 0, c) }))]),
  );
}

/** The same monthly series converted into one currency; months where a currency has no rate are skipped for that currency. */
export function monthlyConverted(
  invoices: readonly InvoiceRow[],
  chosen: readonly string[],
  display: string,
  fx: FxRates,
  months = 12,
  now = new Date(),
): MonthPoint[] {
  const chosenSet = new Set(chosen.map(normCode));
  const per = monthlyPaidByCurrency(invoices.filter((i) => chosenSet.has(normCode(i.currency))), months, now);
  const base = Object.values(per)[0] ?? monthlyPaidByCurrency([], months, now)[Object.keys(per)[0] ?? ""] ?? [];
  const template = base.length ? base : (() => {
    const t: MonthPoint[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      t.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), amountMajor: 0 });
    }
    return t;
  })();
  return template.map((pt, idx) => {
    let total = 0;
    for (const [c, pts] of Object.entries(per)) {
      const conv = convertMinor(toMinor(pts[idx].amountMajor, c), c, display, fx);
      if (conv != null) total += toMajor(conv, display);
    }
    return { key: pt.key, label: pt.label, amountMajor: total };
  });
}

/** `?currencies=usd,inr` → known codes only, uppercase, de-duplicated; empty/absent = all available. */
export function parseCurrencies(csv: string | null | undefined, available: readonly string[]): string[] {
  const avail = available.map(normCode);
  if (!csv) return avail;
  const picked = [...new Set(csv.split(",").map(normCode).filter((c) => avail.includes(c)))];
  return picked.length ? picked : avail;
}

let knownCodes: Set<string> | null | undefined;
/** A real ISO 4217 code the runtime knows (falls back to the three-letter shape where the list is unavailable). */
export function isCurrencyCode(c: string): boolean {
  if (!/^[A-Z]{3}$/.test(c)) return false;
  if (knownCodes === undefined) {
    try {
      const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("currency");
      knownCodes = list ? new Set(list) : null;
    } catch {
      knownCodes = null;
    }
  }
  return knownCodes ? knownCodes.has(c) : true;
}

/** Validate admin-entered rates: ISO codes, finite positive numbers, USD pinned to 1. */
export function sanitizeRates(input: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = { USD: 1 };
  for (const [k, v] of Object.entries(input)) {
    const code = normCode(k);
    const n = typeof v === "number" ? v : Number(v);
    if (code === "USD" || !isCurrencyCode(code) || !Number.isFinite(n) || n <= 0 || n > 1e7) continue;
    out[code] = n;
  }
  return out;
}

export function csvRows(rows: readonly CurrencyRow[]): string[][] {
  return [
    ["Currency", "Paid (period)", "Paid invoices", "Open", "Open invoices", "Active MRR"],
    ...rows.map((r) => [
      r.currency,
      toMajor(r.paidMinor, r.currency).toFixed(minorExponent(r.currency)),
      String(r.paidInvoices),
      toMajor(r.openMinor, r.currency).toFixed(minorExponent(r.currency)),
      String(r.openInvoices),
      toMajor(r.mrrMinor, r.currency).toFixed(minorExponent(r.currency)),
    ]),
  ];
}
