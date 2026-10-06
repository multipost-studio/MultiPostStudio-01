import { describe, it, expect } from "vitest";
import { DEFAULT_HEALTH_CONFIG, normalizeHealthConfig, parseHealthConfig, PROBE_IDS } from "./config";

const clone = () => JSON.parse(JSON.stringify(DEFAULT_HEALTH_CONFIG)) as typeof DEFAULT_HEALTH_CONFIG;

describe("parseHealthConfig", () => {
  it("accepts the defaults and round-trips through JSON", () => {
    const res = parseHealthConfig(JSON.parse(JSON.stringify(DEFAULT_HEALTH_CONFIG)));
    expect(res).toEqual({ ok: true, config: DEFAULT_HEALTH_CONFIG });
  });

  it("rejects unknown keys instead of ignoring them", () => {
    const bad = { ...clone(), surprise: true };
    const res = parseHealthConfig(bad);
    expect(res.ok).toBe(false);
    const typo = clone() as unknown as { thresholds: Record<string, number> };
    typo.thresholds.dbSlowMs = 1;
    expect(parseHealthConfig(typo).ok).toBe(false);
  });

  it("rejects out-of-range numbers and names the field", () => {
    const c = clone();
    c.thresholds.memoryPct = 120;
    const res = parseHealthConfig(c);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toContain("thresholds.memoryPct");
  });

  it("requires the unhealthy threshold to exceed the degraded one", () => {
    const c = clone();
    c.thresholds.dbDegradedMs = 900;
    c.thresholds.dbUnhealthyMs = 800;
    const res = parseHealthConfig(c);
    expect(res.ok).toBe(false);
    c.thresholds = { ...DEFAULT_HEALTH_CONFIG.thresholds, externalDegradedMs: 5000, externalUnhealthyMs: 4000 };
    expect(parseHealthConfig(c).ok).toBe(false);
  });

  it("rejects unknown probe ids and bad intervals, and de-duplicates muted", () => {
    expect(parseHealthConfig({ ...clone(), muted: ["nope"] }).ok).toBe(false);
    expect(parseHealthConfig({ ...clone(), recordEveryMin: 7 }).ok).toBe(false);
    expect(parseHealthConfig({ ...clone(), retentionDays: 0 }).ok).toBe(false);
    const res = parseHealthConfig({ ...clone(), muted: ["ai", "ai", "email"] });
    expect(res.ok && res.config.muted).toEqual(["ai", "email"]);
  });

  it("rejects non-objects", () => {
    expect(parseHealthConfig(null).ok).toBe(false);
    expect(parseHealthConfig("x").ok).toBe(false);
  });
});

describe("normalizeHealthConfig", () => {
  it("falls back to defaults for missing or garbage input", () => {
    expect(normalizeHealthConfig(null)).toEqual(DEFAULT_HEALTH_CONFIG);
    expect(normalizeHealthConfig("junk")).toEqual(DEFAULT_HEALTH_CONFIG);
    expect(normalizeHealthConfig({ thresholds: { memoryPct: 9999 } })).toEqual(DEFAULT_HEALTH_CONFIG);
  });

  it("keeps valid overrides, fills the rest, and drops unknown probe ids", () => {
    const out = normalizeHealthConfig({ thresholds: { workerStaleSec: 900 }, muted: ["ai", "ghost"], recordEveryMin: 30 });
    expect(out.thresholds.workerStaleSec).toBe(900);
    expect(out.thresholds.dbDegradedMs).toBe(DEFAULT_HEALTH_CONFIG.thresholds.dbDegradedMs);
    expect(out.muted).toEqual(["ai"]);
    expect(out.recordEveryMin).toBe(30);
  });

  it("only ever mutes probes that exist", () => {
    expect(PROBE_IDS).toContain("database");
    expect(new Set(PROBE_IDS).size).toBe(PROBE_IDS.length);
  });
});
