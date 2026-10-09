import { describe, expect, it } from "vitest";
import { resolveLedgerRange } from "./ledger-range";
import { successRate } from "./call-log";

const NOW = new Date("2026-10-09T12:00:00Z");

describe("resolveLedgerRange", () => {
  it("defaults to 7 days", () => {
    const r = resolveLedgerRange({}, NOW);
    expect(r).toMatchObject({ preset: "7d", label: "last 7 days", custom: null, invalid: false });
    expect(r.to).toEqual(NOW);
    expect(NOW.getTime() - r.from.getTime()).toBe(7 * 86_400_000);
  });
  it("reads the presets and ignores unknown ones", () => {
    expect(resolveLedgerRange({ callRange: "24h" }, NOW).preset).toBe("24h");
    expect(resolveLedgerRange({ callRange: "30d" }, NOW).preset).toBe("30d");
    expect(resolveLedgerRange({ callRange: "9y" }, NOW).preset).toBe("7d");
  });
  it("accepts a custom range inside the retention window", () => {
    const r = resolveLedgerRange({ callRange: "custom", callFrom: "2026-10-01", callTo: "2026-10-05" }, NOW);
    expect(r).toMatchObject({ preset: "custom", custom: { from: "2026-10-01", to: "2026-10-05" }, invalid: false });
    expect(r.from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("rejects a custom range longer than the log is kept, or a bad one, and falls back with a flag", () => {
    expect(resolveLedgerRange({ callRange: "custom", callFrom: "2026-01-01", callTo: "2026-10-05" }, NOW)).toMatchObject({ preset: "7d", invalid: true });
    expect(resolveLedgerRange({ callRange: "custom", callFrom: "x", callTo: "y" }, NOW)).toMatchObject({ preset: "7d", invalid: true });
  });
});

describe("successRate", () => {
  it("is a percentage to one decimal, or null with no calls", () => {
    expect(successRate(1, 3)).toBe(33.3);
    expect(successRate(3, 3)).toBe(100);
    expect(successRate(0, 0)).toBeNull();
  });
});
