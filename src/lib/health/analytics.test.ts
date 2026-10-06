import { describe, it, expect } from "vitest";
import {
  buildProbeStats,
  buildStrip,
  deriveIncidents,
  evaluateOverallHealth,
  filterIncidents,
  formatDuration,
  percentile,
  runAvailability,
  summarize,
  summarizeIncidents,
} from "./analytics";
import type { ProbeStatus, StoredProbeResult } from "./types";

const T0 = Date.parse("2026-10-06T00:00:00Z");
const min = (n: number) => new Date(T0 + n * 60_000).toISOString();

const row = (probeId: string, status: ProbeStatus, atMin: number, latencyMs: number | null = null): StoredProbeResult => ({
  id: `${probeId}-${atMin}`,
  runId: `run-${atMin}`,
  probeId,
  name: probeId.toUpperCase(),
  category: "core",
  status,
  latencyMs,
  message: `${probeId} ${status}`,
  trigger: "tick",
  createdAt: min(atMin),
});

describe("overall status", () => {
  it("ignores skipped and muted probes", () => {
    expect(evaluateOverallHealth([{ status: "healthy" }, { status: "skipped" }])).toBe("healthy");
    expect(evaluateOverallHealth([{ status: "healthy" }, { status: "unhealthy", muted: true }])).toBe("healthy");
    expect(evaluateOverallHealth([{ status: "healthy" }, { status: "degraded" }])).toBe("degraded");
    expect(evaluateOverallHealth([{ status: "degraded" }, { status: "unhealthy" }])).toBe("unhealthy");
    expect(evaluateOverallHealth([{ status: "skipped" }])).toBe("healthy");
  });

  it("summarises every bucket, including muted", () => {
    expect(
      summarize([{ status: "healthy" }, { status: "degraded", muted: true }, { status: "skipped" }, { status: "unhealthy" }]),
    ).toEqual({ total: 4, healthy: 1, degraded: 1, unhealthy: 1, skipped: 1, muted: 1 });
  });
});

describe("percentile", () => {
  it("uses nearest rank and handles empty input", () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 95)).toBe(50);
    expect(percentile([5], 99)).toBe(5);
    expect(percentile([3, 1, 2], 100)).toBe(3);
  });
});

describe("status strip", () => {
  it("puts each check in its time bucket and keeps the worst status", () => {
    const rows = [row("db", "healthy", 5), row("db", "degraded", 6), row("db", "healthy", 25)];
    const cells = buildStrip(rows, T0, T0 + 30 * 60_000, 3); // 10-minute cells
    expect(cells.map((c) => c.status)).toEqual(["degraded", "none", "healthy"]);
    expect(cells.map((c) => c.checks)).toEqual([2, 0, 1]);
  });

  it("ignores skipped results and anything outside the window", () => {
    const cells = buildStrip([row("x", "skipped", 1), row("x", "unhealthy", 999)], T0, T0 + 10 * 60_000, 2);
    expect(cells.every((c) => c.status === "none")).toBe(true);
  });
});

describe("probe stats", () => {
  const rows = [
    row("db", "healthy", 0, 10),
    row("db", "healthy", 10, 20),
    row("db", "degraded", 20, 300),
    row("db", "unhealthy", 30, null),
    row("ai", "skipped", 0),
    row("ai", "skipped", 10),
  ];
  const stats = buildProbeStats(rows, { from: T0, to: T0 + 40 * 60_000 }, { stripBuckets: 4 });

  it("computes healthy % and availability separately", () => {
    expect(stats.db.checks).toBe(4);
    expect(stats.db.healthyPct).toBe(50);
    expect(stats.db.availabilityPct).toBe(75);
  });

  it("computes latency from checks that have a latency", () => {
    expect(stats.db.latency).toEqual({ avg: 110, p50: 20, p95: 300, max: 300, samples: 3 });
  });

  it("does not invent a percentage for probes that were only skipped", () => {
    expect(stats.ai.checks).toBe(0);
    expect(stats.ai.healthyPct).toBeNull();
    expect(stats.ai.availabilityPct).toBeNull();
  });

  it("reports the latest status and keeps the series in time order", () => {
    expect(stats.db.lastStatus).toBe("unhealthy");
    expect(stats.db.series.map((s) => s.at)).toEqual([min(0), min(10), min(20), min(30)]);
  });
});

describe("incidents", () => {
  const NOW = T0 + 120 * 60_000;

  it("opens at the first bad check and closes at the next healthy one", () => {
    const [i] = deriveIncidents([row("db", "healthy", 0), row("db", "degraded", 10), row("db", "degraded", 20), row("db", "healthy", 40)], NOW);
    expect(i).toMatchObject({ probeId: "db", severity: "degraded", startedAt: min(10), resolvedAt: min(40), checks: 2 });
    expect(i.durationMs).toBe(30 * 60_000);
  });

  it("escalates severity and keeps the worst message", () => {
    const [i] = deriveIncidents([row("db", "degraded", 0), row("db", "unhealthy", 10), row("db", "healthy", 20)], NOW);
    expect(i.severity).toBe("unhealthy");
    expect(i.message).toBe("db unhealthy");
  });

  it("measures an unresolved incident up to now", () => {
    const [i] = deriveIncidents([row("db", "unhealthy", 60)], NOW);
    expect(i.resolvedAt).toBeNull();
    expect(i.durationMs).toBe(60 * 60_000);
  });

  it("ignores skipped results and separates probes", () => {
    const list = deriveIncidents([row("ai", "skipped", 0), row("ai", "skipped", 10), row("db", "degraded", 5), row("q", "unhealthy", 6)], NOW);
    expect(list.map((x) => x.probeId).sort()).toEqual(["db", "q"]);
  });

  it("returns separate incidents for separate outages, newest first", () => {
    const list = deriveIncidents(
      [row("db", "degraded", 0), row("db", "healthy", 10), row("db", "unhealthy", 50), row("db", "healthy", 60)],
      NOW,
    );
    expect(list).toHaveLength(2);
    expect(list[0].startedAt).toBe(min(50));
  });
});

describe("formatDuration", () => {
  it("scales units", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(125_000)).toBe("2m 5s");
    expect(formatDuration(3_600_000 + 5 * 60_000)).toBe("1h 5m");
    expect(formatDuration(3 * 86_400_000 + 2 * 3_600_000)).toBe("3d 2h");
  });
});

describe("run availability", () => {
  const run = (id: string, statuses: ProbeStatus[]) =>
    statuses.map((s, i) => ({ ...row(`p${i}`, s, 0), runId: id }));

  it("scores each run by its worst unmuted probe", () => {
    const rows = [
      ...run("a", ["healthy", "healthy", "healthy"]),
      ...run("b", ["healthy", "degraded", "healthy"]),
      ...run("c", ["healthy", "unhealthy", "healthy"]),
      ...run("d", ["healthy", "healthy", "skipped"]),
    ];
    expect(runAvailability(rows, [])).toEqual({ runs: 4, healthyPct: 50, availabilityPct: 75 });
  });

  it("ignores muted probes and tiny single-probe runs", () => {
    const rows = [...run("a", ["healthy", "unhealthy", "healthy"]), ...run("solo", ["unhealthy"])];
    expect(runAvailability(rows, ["p1"])).toEqual({ runs: 1, healthyPct: 100, availabilityPct: 100 });
    expect(runAvailability([], [])).toEqual({ runs: 0, healthyPct: null, availabilityPct: null });
  });
});

describe("incident filters and summary", () => {
  const NOW = T0 + 600 * 60_000;
  const all = deriveIncidents(
    [
      row("db", "degraded", 0), row("db", "healthy", 10),
      { ...row("mail", "unhealthy", 20), category: "integration" as const }, { ...row("mail", "healthy", 50), category: "integration" as const },
      row("q", "unhealthy", 100),
    ],
    NOW,
  );
  const none = { severities: [], categories: [], probes: [], state: "" as const, q: "" };

  it("filters by severity, category, probe, state and text", () => {
    expect(filterIncidents(all, none)).toHaveLength(3);
    expect(filterIncidents(all, { ...none, severities: ["unhealthy"] }).map((i) => i.probeId).sort()).toEqual(["mail", "q"]);
    expect(filterIncidents(all, { ...none, categories: ["integration"] }).map((i) => i.probeId)).toEqual(["mail"]);
    expect(filterIncidents(all, { ...none, probes: ["db"] })).toHaveLength(1);
    expect(filterIncidents(all, { ...none, state: "open" }).map((i) => i.probeId)).toEqual(["q"]);
    expect(filterIncidents(all, { ...none, state: "resolved" })).toHaveLength(2);
    expect(filterIncidents(all, { ...none, q: "MAIL" })).toHaveLength(1);
  });

  it("summarises open/resolved counts, mean recovery time and the longest", () => {
    const s = summarizeIncidents(all);
    expect(s).toMatchObject({ total: 3, open: 1, resolved: 2 });
    expect(s.meanTimeToRecoverMs).toBe(((10 + 30) / 2) * 60_000);
    expect(s.longestMs).toBe(500 * 60_000);
    expect(summarizeIncidents([])).toEqual({ total: 0, open: 0, resolved: 0, meanTimeToRecoverMs: null, longestMs: null });
  });
});
