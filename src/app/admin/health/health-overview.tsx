"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, Clock, Download, Gauge, RefreshCw, Search, ShieldAlert, TimerReset, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { KpiTile } from "@/components/ui/kpi-tile";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  getHealthStatsAction,
  runSingleProbeAction,
  saveHealthConfigAction,
  triggerHealthProbesAction,
} from "@/app/actions/admin-health";
import { evaluateOverallHealth, severityOf, summarize, type ProbeStats } from "@/lib/health/analytics";
import type { HealthConfig } from "@/lib/health/config";
import type { OverviewStats } from "@/lib/health/overview";
import {
  PROBE_CATEGORIES,
  PROBE_STATUSES,
  RANGES,
  RANGE_LABEL,
  type HealthProbeResult,
  type HealthRange,
  type ProbeCategory,
  type ProbeStatus,
  type SystemHealthReport,
} from "@/lib/health/types";
import { CATEGORY_LABEL, ProbeCard, ProbeRow, type ProbeActions } from "./_probe-card";
import { STATUS_LABEL, StatusIcon, fmtDateTime, fmtMs, fmtPct, statusText } from "./_status";

type SortKey = "severity" | "name" | "latency" | "uptime";
type View = "cards" | "table";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "severity", label: "Sort: worst first" },
  { value: "name", label: "Sort: name" },
  { value: "latency", label: "Sort: slowest first" },
  { value: "uptime", label: "Sort: lowest uptime" },
];
const REFRESH_OPTIONS = [
  { value: "0", label: "Auto-refresh: off" },
  { value: "15", label: "Refresh every 15s" },
  { value: "30", label: "Refresh every 30s" },
  { value: "60", label: "Refresh every 60s" },
];

const list = (v: string | null) => (v ?? "").split(",").filter(Boolean);

function rebuild(probes: HealthProbeResult[], base: SystemHealthReport): SystemHealthReport {
  return { ...base, probes, overallStatus: evaluateOverallHealth(probes), summary: summarize(probes) };
}

export function HealthOverview({
  initialReport,
  initialStats,
  initialConfig,
  range,
  lastRecordedAt,
}: {
  initialReport: SystemHealthReport;
  initialStats: OverviewStats;
  initialConfig: HealthConfig;
  range: HealthRange;
  lastRecordedAt: string | null;
}) {
  const { toast } = useToast();
  const params = useSearchParams();
  const router = useRouter();

  const [report, setReport] = React.useState(initialReport);
  const [stats, setStats] = React.useState(initialStats);
  const [config, setConfig] = React.useState(initialConfig);
  const [recordedAt, setRecordedAt] = React.useState(lastRecordedAt);
  const [running, setRunning] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [refreshSec, setRefreshSec] = React.useState(0);

  // Filters live in component state (instant, no re-run of probes) and mirror to the URL.
  const [q, setQ] = React.useState(params.get("pq") ?? "");
  const [statuses, setStatuses] = React.useState<ProbeStatus[]>(() => list(params.get("ps")).filter((s): s is ProbeStatus => (PROBE_STATUSES as string[]).includes(s)));
  const [categories, setCategories] = React.useState<ProbeCategory[]>(() => list(params.get("pc")).filter((c): c is ProbeCategory => (PROBE_CATEGORIES as string[]).includes(c)));
  const [sort, setSort] = React.useState<SortKey>(() => (SORTS.some((s) => s.value === params.get("psort")) ? (params.get("psort") as SortKey) : "severity"));
  const [view, setView] = React.useState<View>(params.get("pv") === "table" ? "table" : "cards");

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const set = (k: string, v: string) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    set("pq", q.trim());
    set("ps", statuses.join(","));
    set("pc", categories.join(","));
    set("psort", sort === "severity" ? "" : sort);
    set("pv", view === "table" ? "table" : "");
    window.history.replaceState(window.history.state, "", url);
  }, [q, statuses, categories, sort, view]);

  const refreshStats = React.useCallback(async () => {
    const res = await getHealthStatsAction(range);
    if (res.ok && res.data) setStats(res.data);
  }, [range]);

  const run = React.useCallback(
    async (auto: boolean) => {
      setRunning(true);
      try {
        const res = await triggerHealthProbesAction({ auto });
        if (res.ok && res.data) {
          setReport(res.data.report);
          if (res.data.recorded) {
            setRecordedAt(new Date().toISOString());
            await refreshStats();
          }
          if (!auto) toast({ title: "Probes finished", description: res.data.recorded ? "Result stored in history." : "History is not recording (see the banner above).", tone: "success" });
        } else if (!auto) {
          toast({ title: "Couldn't run the probes", description: res.error, tone: "error" });
        }
      } finally {
        setRunning(false);
      }
    },
    [refreshStats, toast],
  );

  React.useEffect(() => {
    if (!refreshSec) return;
    const id = setInterval(() => {
      if (!document.hidden) void run(true);
    }, refreshSec * 1000);
    return () => clearInterval(id);
  }, [refreshSec, run]);

  const actions: ProbeActions = {
    busyId,
    canMute: true,
    onRerun: async (id) => {
      setBusyId(id);
      try {
        const res = await runSingleProbeAction(id);
        if (res.ok && res.data) {
          const fresh = res.data.probe;
          setReport((r) => rebuild(r.probes.map((p) => (p.id === id ? fresh : p)), r));
          if (res.data.recorded) await refreshStats();
          toast({ title: `${fresh.name}: ${STATUS_LABEL[fresh.status].toLowerCase()}`, tone: fresh.status === "healthy" ? "success" : fresh.status === "skipped" ? "info" : "error" });
        } else toast({ title: "Couldn't re-run the probe", description: res.error, tone: "error" });
      } finally {
        setBusyId(null);
      }
    },
    onToggleMute: async (id) => {
      const next: HealthConfig = { ...config, muted: config.muted.includes(id as never) ? config.muted.filter((m) => m !== id) : [...config.muted, id as never] };
      const res = await saveHealthConfigAction(next);
      if (res.ok) {
        setConfig(res.config);
        setReport((r) => rebuild(r.probes.map((p) => ({ ...p, muted: res.config.muted.includes(p.id as never) || undefined })), r));
        await refreshStats();
        toast({ title: res.config.muted.includes(id as never) ? "Probe muted" : "Probe unmuted", tone: "success" });
      } else toast({ title: "Couldn't change the mute setting", description: res.errors[0], tone: "error" });
    },
  };

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = report.probes.filter(
      (p) =>
        (statuses.length === 0 || statuses.includes(p.status)) &&
        (categories.length === 0 || categories.includes(p.category)) &&
        (!needle || `${p.name} ${p.message} ${p.category} ${p.id}`.toLowerCase().includes(needle)),
    );
    const byStats = (p: HealthProbeResult): ProbeStats | undefined => stats.stats[p.id];
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "latency") return (b.latencyMs ?? -1) - (a.latencyMs ?? -1);
      if (sort === "uptime") return (byStats(a)?.availabilityPct ?? 101) - (byStats(b)?.availabilityPct ?? 101);
      return severityOf(b.status) - severityOf(a.status) || a.name.localeCompare(b.name);
    });
  }, [report.probes, q, statuses, categories, sort, stats.stats]);

  const filtersActive = q.trim() !== "" || statuses.length > 0 || categories.length > 0;
  const clearFilters = () => {
    setQ("");
    setStatuses([]);
    setCategories([]);
  };
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const exportHref = (scope: string, format: "csv" | "json") => {
    const p = new URLSearchParams({ scope, format, range });
    if (scope === "report") {
      if (statuses.length) p.set("status", statuses.join(","));
      if (categories.length) p.set("category", categories.join(","));
      if (q.trim()) p.set("q", q.trim());
    }
    return `/api/admin/health/export?${p}`;
  };

  const slowest = report.probes.filter((p) => typeof p.latencyMs === "number").sort((a, b) => (b.latencyMs ?? 0) - (a.latencyMs ?? 0))[0];
  const overall = report.overallStatus;
  const s = report.summary;

  return (
    <div className="space-y-5">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void run(false)} disabled={running} className="gap-1.5">
          <RefreshCw size={14} className={running ? "animate-spin" : ""} /> {running ? "Running probes…" : "Run probes now"}
        </Button>
        <Select aria-label="Auto-refresh" size="sm" value={String(refreshSec)} onChange={(e) => setRefreshSec(Number(e.target.value))} className="w-auto">
          {REFRESH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Segmented<HealthRange>
            label="History window"
            value={range}
            onChange={(v) => router.push(`/admin/health?range=${v}`)}
            options={RANGES.map((r) => ({ value: r, label: r }))}
          />
          <Dropdown
            align="end"
            label="Export"
            trigger={
              <Button variant="secondary" size="sm" className="gap-1.5"><Download size={14} /> Export</Button>
            }
          >
            <MenuItem asChild><a href={exportHref("report", "csv")}>Live report (CSV){filtersActive ? ", filtered" : ""}</a></MenuItem>
            <MenuItem asChild><a href={exportHref("report", "json")}>Live report (JSON){filtersActive ? ", filtered" : ""}</a></MenuItem>
            <MenuItem asChild><a href={exportHref("history", "csv")}>History (CSV)</a></MenuItem>
            <MenuItem asChild><a href={exportHref("history", "json")}>History (JSON)</a></MenuItem>
            <MenuItem asChild><a href={exportHref("incidents", "csv")}>Incidents ({range}, CSV)</a></MenuItem>
            <MenuItem asChild><a href={exportHref("config", "json")}>Settings (JSON)</a></MenuItem>
          </Dropdown>
        </div>
      </div>

      {!stats.available && (
        <div role="status" className="rounded-[var(--radius-md)] border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-3.5 py-2.5 text-[13px] text-[var(--text)]">
          <strong className="font-semibold">History is not recording yet.</strong> The probes below are live and accurate, but uptime, trends, incidents and alerts need the{" "}
          <code className="rounded bg-[var(--bg-sunken)] px-1 text-[12px]">HealthProbeRun</code> table. It is created by the pending migration on your next deploy.
        </div>
      )}
      {stats.truncated && (
        <div role="status" className="rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3.5 py-2 text-[12.5px] text-[var(--text-muted)]">
          This window holds more results than are loaded, so uptime and trends cover its most recent part. Choose a shorter window for exact figures.
        </div>
      )}

      {/* Overall banner */}
      <section aria-live="polite" className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-4">
          <span className={cn("flex h-14 w-14 items-center justify-center rounded-full", overall === "healthy" ? "bg-[var(--success-soft)]" : overall === "degraded" ? "bg-[var(--warning-soft)]" : "bg-[var(--danger-soft)]")}>
            <StatusIcon status={overall} size={26} />
          </span>
          <div>
            <h2 className="text-[20px] font-semibold uppercase tracking-tight text-[var(--text)]">
              System <span className={statusText(overall)}>{overall}</span>
            </h2>
            <p className="text-[13px] text-[var(--text-muted)]">
              Evaluated {fmtDateTime(report.timestamp)} · {s.healthy} of {s.total - s.skipped} configured probes healthy
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-center">
          {(
            [
              ["Healthy", s.healthy, "text-[var(--success)]"],
              ["Degraded", s.degraded, "text-[var(--warning)]"],
              ["Unhealthy", s.unhealthy, "text-[var(--danger)]"],
              ["Not configured", s.skipped, "text-[var(--text-subtle)]"],
              ["Muted", s.muted, "text-[var(--text-subtle)]"],
            ] as const
          ).map(([label, n, tone]) => (
            <div key={label} className="min-w-[78px] rounded-[var(--radius-md)] bg-[var(--bg-sunken)] px-3 py-2">
              <span className="block text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
              <span className={cn("text-[20px] font-semibold tabular-nums", tone)}>{n}</span>
            </div>
          ))}
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile hero label={`Availability · ${range}`} icon={<Activity size={17} />} value={stats.availability.runs ? fmtPct(stats.availability.availabilityPct) : "—"} hint={stats.availability.runs ? `${fmtPct(stats.availability.healthyPct)} fully healthy · ${stats.availability.runs} run${stats.availability.runs === 1 ? "" : "s"}` : "no history yet"} />
        <KpiTile label="Open incidents" icon={<ShieldAlert size={17} />} value={String(stats.openIncidents)} hint={stats.openIncidents ? "unresolved right now" : "none open"} />
        <KpiTile label="Slowest probe" icon={<Gauge size={17} />} value={slowest ? fmtMs(slowest.latencyMs) : "—"} hint={slowest ? slowest.name : "no timings"} />
        <KpiTile label="Last recorded" icon={<Clock size={17} />} value={recordedAt ? new Date(recordedAt).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }) + " UTC" : "—"} hint={config.recordEveryMin ? `auto every ${config.recordEveryMin} min` : "auto-record off"} />
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search probes, messages, categories…" aria-label="Search probes" className="h-9 pl-8" />
          </div>
          <Select aria-label="Sort probes" size="sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-auto">
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <div className="ml-auto">
            <Segmented<View> label="Layout" value={view} onChange={setView} options={[{ value: "cards", label: "Cards" }, { value: "table", label: "Table" }]} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <FilterGroup label="Status">
            {PROBE_STATUSES.map((st) => (
              <Chip key={st} on={statuses.includes(st)} onClick={() => setStatuses((a) => toggle(a, st))}>
                {STATUS_LABEL[st]} <span className="tabular-nums opacity-70">{report.probes.filter((p) => p.status === st).length}</span>
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="Category">
            {PROBE_CATEGORIES.map((c) => (
              <Chip key={c} on={categories.includes(c)} onClick={() => setCategories((a) => toggle(a, c))}>
                {CATEGORY_LABEL[c]} <span className="tabular-nums opacity-70">{report.probes.filter((p) => p.category === c).length}</span>
              </Chip>
            ))}
          </FilterGroup>
          <p className="ml-auto flex items-center gap-2 text-[13px] text-[var(--text-muted)]" aria-live="polite">
            Showing {filtered.length} of {report.probes.length}
            {filtersActive && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="gap-1 px-2.5">
                <X size={13} /> Clear
              </Button>
            )}
          </p>
        </div>
      </div>

      {/* Probes */}
      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-10 text-center text-[14px] text-[var(--text-muted)]">
          <TimerReset className="mx-auto mb-2 text-[var(--text-subtle)]" size={22} aria-hidden />
          No probes match these filters.
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button>
          </div>
        </div>
      ) : view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProbeCard key={p.id} probe={p} stats={stats.stats[p.id]} historyAvailable={stats.available} actions={actions} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
                <th className="px-4 py-3 font-semibold">Probe</th>
                <th className="hidden px-3 py-3 font-semibold md:table-cell">Category</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold">Latency</th>
                <th className="hidden px-3 py-3 text-right font-semibold lg:table-cell">p95</th>
                <th className="hidden px-3 py-3 text-right font-semibold sm:table-cell">Uptime</th>
                <th className="hidden px-3 py-3 font-semibold xl:table-cell">{RANGE_LABEL[range]}</th>
                <th className="px-2 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <ProbeRow key={p.id} probe={p} stats={stats.stats[p.id]} historyAvailable={stats.available} actions={actions} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
      <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
        on ? "border-transparent bg-[var(--text)] text-[var(--bg-elevated)]" : "border-[var(--border-strong)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
      )}
    >
      {children}
    </button>
  );
}
