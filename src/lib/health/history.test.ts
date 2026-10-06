import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  createMany: vi.fn(),
  loadConfig: vi.fn(),
  loadState: vi.fn(),
  saveState: vi.fn(),
  runProbes: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { healthProbeRun: { createMany: m.createMany, deleteMany: m.deleteMany } } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./config-store", () => ({ loadHealthConfig: m.loadConfig, loadHealthState: m.loadState, saveHealthState: m.saveState }));
vi.mock("./run", () => ({ runSystemHealthProbes: m.runProbes }));

import { DEFAULT_HEALTH_CONFIG } from "./config";
import { historyWhere, parseHistoryFilters, recordHealthRun, recordScheduledHealthRun } from "./history";
import type { SystemHealthReport } from "./types";

const report = (): SystemHealthReport => ({
  overallStatus: "healthy",
  timestamp: "2026-10-06T12:00:00.000Z",
  probes: [
    { id: "database", name: "DB", category: "core", status: "healthy", description: "d", message: "ok", latencyMs: 12.4, details: { a: 1 }, checkedAt: "2026-10-06T12:00:00.000Z" },
    { id: "ai", name: "AI", category: "integration", status: "skipped", description: "d", message: "no key", checkedAt: "2026-10-06T12:00:01.000Z" },
  ],
  summary: { total: 2, healthy: 1, degraded: 0, unhealthy: 0, skipped: 1, muted: 0 },
});

beforeEach(() => {
  vi.clearAllMocks();
  m.loadConfig.mockResolvedValue(DEFAULT_HEALTH_CONFIG);
  m.loadState.mockResolvedValue({});
  m.saveState.mockResolvedValue(undefined);
  m.createMany.mockResolvedValue({ count: 2 });
  m.runProbes.mockResolvedValue(report());
  m.deleteMany.mockResolvedValue({ count: 0 });
});

describe("recordHealthRun", () => {
  it("writes one row per probe sharing a run id, rounding latency and keeping details", async () => {
    const runId = await recordHealthRun(report(), { trigger: "manual", actorId: "admin_1" });
    expect(runId).toEqual(expect.any(String));
    const data = m.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(2);
    expect(new Set(data.map((r: { runId: string }) => r.runId))).toEqual(new Set([runId]));
    expect(data[0]).toMatchObject({ probeId: "database", latencyMs: 12, trigger: "manual", actorId: "admin_1", details: '{"a":1}' });
    expect(data[1]).toMatchObject({ probeId: "ai", latencyMs: null, details: null, status: "skipped" });
  });

  it("returns null instead of throwing when the table is missing", async () => {
    m.createMany.mockRejectedValue(Object.assign(new Error("The table `public.HealthProbeRun` does not exist"), { code: "P2021" }));
    await expect(recordHealthRun(report(), { trigger: "page" })).resolves.toBeNull();
  });

  it("prunes old history at most once a day", async () => {
    await recordHealthRun(report(), { trigger: "page" });
    expect(m.deleteMany).toHaveBeenCalledTimes(1);
    m.deleteMany.mockClear();
    m.loadState.mockResolvedValue({ lastPrunedAt: new Date().toISOString() });
    await recordHealthRun(report(), { trigger: "page" });
    expect(m.deleteMany).not.toHaveBeenCalled();
  });
});

describe("recordScheduledHealthRun (called from the tick)", () => {
  it("does nothing when auto-recording is off", async () => {
    m.loadConfig.mockResolvedValue({ ...DEFAULT_HEALTH_CONFIG, recordEveryMin: 0 });
    expect(await recordScheduledHealthRun()).toBe(false);
    expect(m.runProbes).not.toHaveBeenCalled();
  });

  it("skips while the interval has not elapsed", async () => {
    m.loadState.mockResolvedValue({ lastRecordedAt: new Date(Date.now() - 5 * 60_000).toISOString() });
    expect(await recordScheduledHealthRun()).toBe(false);
    expect(m.runProbes).not.toHaveBeenCalled();
    expect(m.createMany).not.toHaveBeenCalled();
  });

  it("claims the slot first, then runs and stores a tick-tagged pass once the interval elapsed", async () => {
    m.loadState.mockResolvedValue({ lastRecordedAt: new Date(Date.now() - 20 * 60_000).toISOString() });
    const order: string[] = [];
    m.saveState.mockImplementation(async () => void order.push("claim"));
    m.runProbes.mockImplementation(async () => (order.push("run"), report()));
    expect(await recordScheduledHealthRun()).toBe(true);
    expect(order.slice(0, 2)).toEqual(["claim", "run"]);
    expect(m.createMany.mock.calls[0][0].data[0].trigger).toBe("tick");
  });

  it("runs on a first-ever tick", async () => {
    expect(await recordScheduledHealthRun()).toBe(true);
  });
});

describe("history filters", () => {
  const get = (q: Record<string, string>) => (k: string) => q[k] ?? null;
  const now = new Date("2026-10-06T12:00:00Z");

  it("parses lists and drops unknown values", () => {
    const f = parseHistoryFilters(get({ probe: "database,ai", status: "unhealthy,bogus", category: "core", trigger: "tick,hack", q: " slow " }), now);
    expect(f).toMatchObject({ probes: ["database", "ai"], statuses: ["unhealthy"], categories: ["core"], triggers: ["tick"], q: "slow" });
  });

  it("parses UTC day boundaries, ignores malformed dates and clamps the end to now", () => {
    const f = parseHistoryFilters(get({ from: "2026-10-01", to: "2099-01-01" }), now);
    expect(f.from?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(f.to?.toISOString()).toBe(now.toISOString());
    expect(parseHistoryFilters(get({ from: "yesterday", to: "2026-13-45" }), now)).toMatchObject({ from: undefined, to: undefined });
    expect(parseHistoryFilters(get({ to: "2026-10-03" }), now).to?.toISOString()).toBe("2026-10-03T23:59:59.999Z");
  });

  it("builds a where clause only from the filters that are set", () => {
    expect(historyWhere({ probes: [], statuses: [], categories: [], triggers: [], q: "" })).toEqual({});
    const w = historyWhere({ from: now, probes: ["ai"], statuses: ["degraded"], categories: [], triggers: ["tick"], q: "x" });
    expect(w).toMatchObject({ createdAt: { gte: now }, probeId: { in: ["ai"] }, status: { in: ["degraded"] }, trigger: { in: ["tick"] } });
    expect(w.OR).toHaveLength(2);
  });
});
