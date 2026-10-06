import type {
  HealthProbeResult,
  HealthSummary,
  ProbeCategory,
  ProbeStatus,
  StoredProbeResult,
} from "./types";

/**
 * Pure maths over probe results: overall status, uptime, latency percentiles,
 * status strips and incident detection. Nothing here touches the database or
 * the clock (callers pass `now`), so every function is directly testable.
 */

const SEVERITY: Record<ProbeStatus, number> = { skipped: 0, healthy: 1, degraded: 2, unhealthy: 3 };

export const severityOf = (s: ProbeStatus): number => SEVERITY[s];

/** Muted and skipped probes never count towards overall status. */
export function evaluateOverallHealth(probes: Pick<HealthProbeResult, "status" | "muted">[]): ProbeStatus {
  const live = probes.filter((p) => !p.muted && p.status !== "skipped");
  if (live.some((p) => p.status === "unhealthy")) return "unhealthy";
  if (live.some((p) => p.status === "degraded")) return "degraded";
  return "healthy";
}

export function summarize(probes: Pick<HealthProbeResult, "status" | "muted">[]): HealthSummary {
  const count = (s: ProbeStatus) => probes.filter((p) => p.status === s).length;
  return {
    total: probes.length,
    healthy: count("healthy"),
    degraded: count("degraded"),
    unhealthy: count("unhealthy"),
    skipped: count("skipped"),
    muted: probes.filter((p) => p.muted).length,
  };
}

/** Nearest-rank percentile. Returns null for an empty set. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1];
}

export type StripCell = { from: number; to: number; status: ProbeStatus | "none"; checks: number };

export type ProbeStats = {
  probeId: string;
  name: string;
  category: ProbeCategory;
  checks: number;
  /** Share of checks that were fully healthy. */
  healthyPct: number | null;
  /** Share of checks that were not unhealthy (degraded still serves traffic). */
  availabilityPct: number | null;
  latency: { avg: number | null; p50: number | null; p95: number | null; max: number | null; samples: number };
  lastStatus: ProbeStatus | null;
  lastCheckedAt: string | null;
  /** Most recent latency points (oldest first) for sparklines. */
  series: { at: string; latencyMs: number | null; status: ProbeStatus }[];
  strip: StripCell[];
};

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

/** Divide [from,to] into `buckets` equal cells; each takes the worst status seen in it. */
export function buildStrip(rows: Pick<StoredProbeResult, "status" | "createdAt">[], from: number, to: number, buckets: number): StripCell[] {
  const span = Math.max(1, to - from);
  const size = span / buckets;
  const cells: StripCell[] = Array.from({ length: buckets }, (_, i) => ({
    from: Math.round(from + i * size),
    to: Math.round(from + (i + 1) * size),
    status: "none",
    checks: 0,
  }));
  for (const r of rows) {
    if (r.status === "skipped") continue;
    const t = Date.parse(r.createdAt);
    if (!Number.isFinite(t) || t < from || t > to) continue;
    const idx = Math.min(buckets - 1, Math.floor((t - from) / size));
    const cell = cells[idx];
    cell.checks += 1;
    if (cell.status === "none" || SEVERITY[r.status] > SEVERITY[cell.status as ProbeStatus]) cell.status = r.status;
  }
  return cells;
}

export function buildProbeStats(
  rows: StoredProbeResult[],
  window: { from: number; to: number },
  opts: { stripBuckets?: number; seriesPoints?: number } = {},
): Record<string, ProbeStats> {
  const { stripBuckets = 48, seriesPoints = 40 } = opts;
  const byProbe = new Map<string, StoredProbeResult[]>();
  for (const r of rows) {
    const list = byProbe.get(r.probeId) ?? [];
    list.push(r);
    byProbe.set(r.probeId, list);
  }
  const out: Record<string, ProbeStats> = {};
  for (const [probeId, list] of byProbe) {
    const sorted = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const counted = sorted.filter((r) => r.status !== "skipped");
    const healthy = counted.filter((r) => r.status === "healthy").length;
    const unhealthy = counted.filter((r) => r.status === "unhealthy").length;
    const lat = counted.map((r) => r.latencyMs).filter((v): v is number => typeof v === "number");
    const last = sorted[sorted.length - 1];
    out[probeId] = {
      probeId,
      name: last.name,
      category: last.category,
      checks: counted.length,
      healthyPct: pct(healthy, counted.length),
      availabilityPct: pct(counted.length - unhealthy, counted.length),
      latency: {
        avg: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
        p50: percentile(lat, 50),
        p95: percentile(lat, 95),
        max: lat.length ? Math.max(...lat) : null,
        samples: lat.length,
      },
      lastStatus: last.status,
      lastCheckedAt: last.createdAt,
      series: sorted.slice(-seriesPoints).map((r) => ({ at: r.createdAt, latencyMs: r.latencyMs, status: r.status })),
      strip: buildStrip(sorted, window.from, window.to, stripBuckets),
    };
  }
  return out;
}

export type Incident = {
  /** Stable: probe + start time. */
  id: string;
  probeId: string;
  name: string;
  category: ProbeCategory;
  severity: "degraded" | "unhealthy";
  startedAt: string;
  resolvedAt: string | null;
  /** Milliseconds from start to recovery, or to `now` while still open. */
  durationMs: number;
  checks: number;
  message: string;
};

/**
 * An incident opens at the first non-healthy check of a probe and closes at the
 * next healthy one. `skipped` results are ignored (service not configured is not
 * an outage). Severity is the worst status seen while open. An incident that is
 * still open is measured up to `now`.
 */
export function deriveIncidents(rows: StoredProbeResult[], now: number): Incident[] {
  const byProbe = new Map<string, StoredProbeResult[]>();
  for (const r of rows) {
    if (r.status === "skipped") continue;
    const list = byProbe.get(r.probeId) ?? [];
    list.push(r);
    byProbe.set(r.probeId, list);
  }
  const incidents: Incident[] = [];
  for (const [probeId, list] of byProbe) {
    const sorted = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    let open: { startedAt: string; severity: "degraded" | "unhealthy"; checks: number; message: string; name: string; category: ProbeCategory } | null = null;
    const close = (resolvedAt: string | null) => {
      if (!open) return;
      const start = Date.parse(open.startedAt);
      const end = resolvedAt ? Date.parse(resolvedAt) : now;
      incidents.push({
        id: `${probeId}@${open.startedAt}`,
        probeId,
        name: open.name,
        category: open.category,
        severity: open.severity,
        startedAt: open.startedAt,
        resolvedAt,
        durationMs: Math.max(0, end - start),
        checks: open.checks,
        message: open.message,
      });
      open = null;
    };
    for (const r of sorted) {
      if (r.status === "healthy") {
        close(r.createdAt);
        continue;
      }
      const sev = r.status as "degraded" | "unhealthy";
      if (!open) {
        open = { startedAt: r.createdAt, severity: sev, checks: 1, message: r.message, name: r.name, category: r.category };
      } else {
        open.checks += 1;
        if (SEVERITY[sev] > SEVERITY[open.severity]) {
          open.severity = sev;
          open.message = r.message;
        }
      }
    }
    close(null);
  }
  return incidents.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60 ? `${s % 60}s` : ""}`.trim();
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24 ? `${h % 24}h` : ""}`.trim();
}

export type RunAvailability = { runs: number; healthyPct: number | null; availabilityPct: number | null };

/**
 * Whole-system availability over a window: each stored run is one data point
 * whose status is the worst of its (unmuted) probes. Runs holding fewer than
 * `minProbes` results (a single-probe re-run) are ignored so they cannot
 * stand in for the whole system.
 */
export function runAvailability(rows: StoredProbeResult[], mutedIds: string[], minProbes = 3): RunAvailability {
  const byRun = new Map<string, StoredProbeResult[]>();
  for (const r of rows) {
    const list = byRun.get(r.runId) ?? [];
    list.push(r);
    byRun.set(r.runId, list);
  }
  let runs = 0;
  let healthy = 0;
  let notUnhealthy = 0;
  for (const list of byRun.values()) {
    if (list.length < minProbes) continue;
    const overall = evaluateOverallHealth(list.map((r) => ({ status: r.status, muted: mutedIds.includes(r.probeId) })));
    runs += 1;
    if (overall === "healthy") healthy += 1;
    if (overall !== "unhealthy") notUnhealthy += 1;
  }
  return { runs, healthyPct: pct(healthy, runs), availabilityPct: pct(notUnhealthy, runs) };
}

export type IncidentFilter = {
  severities: ProbeStatus[];
  categories: ProbeCategory[];
  probes: string[];
  state: "open" | "resolved" | "";
  q: string;
};

/** Shared by the Incidents tab and its export so the file matches the screen. */
export function filterIncidents(incidents: Incident[], f: IncidentFilter): Incident[] {
  const needle = f.q.trim().toLowerCase();
  return incidents.filter(
    (i) =>
      (f.severities.length === 0 || f.severities.includes(i.severity)) &&
      (f.categories.length === 0 || f.categories.includes(i.category)) &&
      (f.probes.length === 0 || f.probes.includes(i.probeId)) &&
      (f.state === "" || (f.state === "open") === (i.resolvedAt === null)) &&
      (!needle || `${i.name} ${i.message}`.toLowerCase().includes(needle)),
  );
}

export type IncidentSummary = { total: number; open: number; resolved: number; meanTimeToRecoverMs: number | null; longestMs: number | null };

export function summarizeIncidents(incidents: Incident[]): IncidentSummary {
  const resolved = incidents.filter((i) => i.resolvedAt !== null);
  return {
    total: incidents.length,
    open: incidents.length - resolved.length,
    resolved: resolved.length,
    meanTimeToRecoverMs: resolved.length ? Math.round(resolved.reduce((n, i) => n + i.durationMs, 0) / resolved.length) : null,
    longestMs: incidents.length ? Math.max(...incidents.map((i) => i.durationMs)) : null,
  };
}
