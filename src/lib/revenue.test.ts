import { describe, expect, it } from "vitest";
import {
  EMPTY_FX, convertMinor, convertRows, csvRows, formatMoney, minorExponent, monthlyConverted, monthlyPaidByCurrency,
  parseCurrencies, parsePeriod, sanitizeRates, summarizeByCurrency, toMajor, toMinor, type FxRates, type InvoiceRow,
} from "./revenue";

const NOW = new Date("2026-10-15T12:00:00Z");
const fx: FxRates = { rates: { USD: 1, INR: 80, EUR: 0.9, JPY: 150 }, updatedAt: "2026-10-01T00:00:00Z", source: "test" };
const inv = (amountDue: number, currency: string, status = "paid", createdAt = "2026-10-10T00:00:00Z"): InvoiceRow => ({ amountDue, currency, status, createdAt });

describe("minor units", () => {
  it("knows each currency's decimals", () => {
    expect(minorExponent("usd")).toBe(2);
    expect(minorExponent("INR")).toBe(2);
    expect(minorExponent("JPY")).toBe(0);
    expect(minorExponent("KWD")).toBe(3);
    expect(minorExponent("nonsense")).toBe(2);
  });
  it("round-trips major and minor", () => {
    expect(toMajor(12345, "USD")).toBe(123.45);
    expect(toMinor(123.45, "USD")).toBe(12345);
    expect(toMajor(500, "JPY")).toBe(500);
    expect(toMinor(1.005, "KWD")).toBe(1005);
  });
  it("formats with the right symbol and Indian grouping for INR", () => {
    expect(formatMoney(1050000, "usd")).toBe("$10,500.00");
    expect(formatMoney(10499000, "INR")).toBe("₹1,04,990.00");
    expect(formatMoney(500, "JPY")).toContain("500");
  });
});

describe("conversion", () => {
  it("converts through USD and respects different decimals", () => {
    expect(convertMinor(10000, "USD", "INR", fx)).toBe(800000); // $100 -> ₹8,000.00
    expect(convertMinor(800000, "INR", "USD", fx)).toBe(10000);
    expect(convertMinor(10000, "USD", "JPY", fx)).toBe(15000); // $100 -> ¥15,000 (no minor unit)
    expect(convertMinor(15000, "JPY", "INR", fx)).toBe(800000);
  });
  it("same currency is untouched, even with no rates", () => {
    expect(convertMinor(123, "INR", "INR", EMPTY_FX)).toBe(123);
  });
  it("returns null instead of guessing when a rate is missing", () => {
    expect(convertMinor(100, "USD", "INR", EMPTY_FX)).toBeNull();
    expect(convertMinor(100, "GBP", "USD", fx)).toBeNull();
  });
});

describe("summarizeByCurrency", () => {
  const invoices = [
    inv(10000, "usd"), inv(5000, "usd"), inv(800000, "inr"),
    inv(9999, "usd", "paid", "2026-01-01T00:00:00Z"), // outside 30d
    inv(2000, "usd", "open", "2026-01-01T00:00:00Z"), inv(100000, "inr", "open"), inv(777, "usd", "void"),
  ];
  it("keeps currencies apart and applies the period to paid only", () => {
    const rows = summarizeByCurrency(invoices, { USD: 3000, INR: 240000 }, "30d", NOW);
    const usd = rows.find((r) => r.currency === "USD")!;
    const inr = rows.find((r) => r.currency === "INR")!;
    expect(usd).toMatchObject({ paidMinor: 15000, paidInvoices: 2, openMinor: 2000, openInvoices: 1, mrrMinor: 3000 });
    expect(inr).toMatchObject({ paidMinor: 800000, openMinor: 100000, mrrMinor: 240000 });
  });
  it("all-time includes older paid invoices; void never counts", () => {
    const usd = summarizeByCurrency(invoices, {}, "all", NOW).find((r) => r.currency === "USD")!;
    expect(usd.paidMinor).toBe(24999);
  });
  it("a currency with only MRR still appears", () => {
    expect(summarizeByCurrency([], { EUR: 500 }, "30d", NOW)).toEqual([expect.objectContaining({ currency: "EUR", mrrMinor: 500 })]);
  });
  it("sorts by revenue", () => {
    expect(summarizeByCurrency(invoices, {}, "30d", NOW).map((r) => r.currency)).toEqual(["INR", "USD"]);
  });
});

describe("convertRows", () => {
  const rows = summarizeByCurrency([inv(10000, "usd"), inv(800000, "inr"), inv(5000, "gbp")], { USD: 1000, INR: 80000 }, "30d", NOW);
  it("totals the chosen currencies in the display currency and names the unconvertible one", () => {
    const t = convertRows(rows, "USD", fx);
    expect(t.paidMinor).toBe(20000); // $100 + ₹8,000 ($100)
    expect(t.mrrMinor).toBe(2000);
    expect(t.missing).toEqual(["GBP"]);
    expect(t.currency).toBe("USD");
  });
  it("converting to INR scales correctly", () => {
    expect(convertRows(rows.filter((r) => r.currency !== "GBP"), "INR", fx).paidMinor).toBe(1600000);
  });
  it("without rates, only the display currency itself contributes", () => {
    const t = convertRows(rows, "USD", EMPTY_FX);
    expect(t.paidMinor).toBe(10000);
    expect(t.missing.sort()).toEqual(["GBP", "INR"]);
  });
});

describe("monthly series", () => {
  const invoices = [inv(10000, "usd", "paid", "2026-10-02T00:00:00Z"), inv(5000, "usd", "paid", "2026-09-20T00:00:00Z"), inv(800000, "inr", "paid", "2026-10-05T00:00:00Z"), inv(1, "usd", "paid", "2024-01-01T00:00:00Z")];
  it("buckets per currency over exactly 12 months, oldest first", () => {
    const s = monthlyPaidByCurrency(invoices, 12, NOW);
    expect(s.USD).toHaveLength(12);
    expect(s.USD[11]).toMatchObject({ key: "2026-10", amountMajor: 100 });
    expect(s.USD[10]).toMatchObject({ key: "2026-09", amountMajor: 50 });
    expect(s.INR[11].amountMajor).toBe(8000);
  });
  it("converted series adds currencies in the display currency", () => {
    const s = monthlyConverted(invoices, ["USD", "INR"], "USD", fx, 12, NOW);
    expect(s[11].amountMajor).toBe(200);
    expect(s[10].amountMajor).toBe(50);
  });
  it("honours the chosen currencies only", () => {
    expect(monthlyConverted(invoices, ["USD"], "USD", fx, 12, NOW)[11].amountMajor).toBe(100);
  });
  it("is an all-zero series, not a crash, when nothing is chosen", () => {
    const s = monthlyConverted([], [], "USD", fx, 12, NOW);
    expect(s).toHaveLength(12);
    expect(s.every((p) => p.amountMajor === 0)).toBe(true);
  });
});

describe("inputs", () => {
  it("parses periods with a safe default", () => {
    expect(parsePeriod("90d")).toBe("90d");
    expect(parsePeriod("bogus")).toBe("30d");
    expect(parsePeriod(undefined)).toBe("30d");
  });
  it("parses currency selections against what exists", () => {
    expect(parseCurrencies("inr,usd,xyz", ["USD", "INR"])).toEqual(["INR", "USD"]);
    expect(parseCurrencies(null, ["USD", "INR"])).toEqual(["USD", "INR"]);
    expect(parseCurrencies("xyz", ["USD", "INR"])).toEqual(["USD", "INR"]);
  });
  it("sanitizes rates: ISO codes, positive finite, USD pinned", () => {
    expect(sanitizeRates({ usd: 5, inr: "83.5", eur: 0, jpy: -1, zzz: 2, xxxx: 3, gbp: Infinity, AED: 3.67 })).toEqual({ USD: 1, INR: 83.5, AED: 3.67 });
  });
  it("exports a CSV matrix with the right decimals", () => {
    const rows = summarizeByCurrency([inv(1234, "usd"), inv(500, "jpy")], { USD: 100 }, "30d", NOW);
    const m = csvRows(rows);
    expect(m[0][0]).toBe("Currency");
    expect(m.find((r) => r[0] === "USD")![1]).toBe("12.34");
    expect(m.find((r) => r[0] === "JPY")![1]).toBe("500");
  });
});
