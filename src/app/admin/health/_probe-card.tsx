"use client";

import * as React from "react";
import { BellOff, Bell, ChevronDown, Cpu, Database, HardDrive, RefreshCw, ShieldCheck, Zap, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getProbeHistoryAction } from "@/app/actions/admin-health";
import type { ProbeStats } from "@/lib/health/analytics";
import type { HealthProbeResult, ProbeCategory, StoredProbeResult } from "@/lib/health/types";
import { LatencySpark, StatusPill, StatusStrip, fmtDateTime, fmtMs, fmtPct } from "./_status";

export const CATEGORY_LABEL: Record<ProbeCategory, string> = {
  core: "Core",
  infrastructure: "Infrastructure",
  integration: "Integration",
  security: "Security",
  application: "Application",
};

const CATEGORY_ICON: Record<ProbeCategory, React.ComponentType<{ size?: number; className?: string }>> = {
  core: Database,
  infrastructure: HardDrive,
  integration: Zap,
  security: ShieldCheck,
  application: Server,
};

export function CategoryIcon({ category, className }: { category: ProbeCategory; className?: string }) {
  const Icon = CATEGORY_ICON[category] ?? Cpu;
  return <Icon size={15} className={cn("text-[var(--primary)]", className)} />;
}

export type ProbeActions = {
  busyId: string | null;
  onRerun: (id: string) => void;
  onToggleMute: (id: string) => void;
  canMute: boolean;
};

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">{label}</p>
      <p className={cn("mt-0.5 truncate font-mono text-[14px] font-semibold tabular-nums text-[var(--text)]", tone)}>{value}</p>
    </div>
  );
}

function ProbeButtons({ probe, actions, open, onToggle }: { probe: HealthProbeResult; actions: ProbeActions; open: boolean; onToggle: () => void }) {
  const busy = actions.busyId === probe.id;
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={onToggle} aria-expanded={open} className="gap-1 px-2.5">
        Details <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => actions.onRerun(probe.id)} disabled={busy} aria-label={`Re-run ${probe.name}`} title="Re-run this probe" className="w-8 px-0">
        <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
      </Button>
      {actions.canMute && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => actions.onToggleMute(probe.id)}
          aria-label={probe.muted ? `Unmute ${probe.name}` : `Mute ${probe.name}`}
          title={probe.muted ? "Unmute: count it towards overall status and alerts again" : "Mute: still run it, but exclude it from overall status and alerts"}
          className="w-8 px-0"
        >
          {probe.muted ? <Bell size={14} /> : <BellOff size={14} />}
        </Button>
      )}
    </div>
  );
}

/** Expanded panel: what the probe checks, the live detail values, and its recent stored results. */
export function ProbeDetails({ probe, historyAvailable }: { probe: HealthProbeResult; historyAvailable: boolean }) {
  const [recent, setRecent] = React.useState<StoredProbeResult[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!historyAvailable) return;
    let alive = true;
    void getProbeHistoryAction(probe.id, 15).then((res) => {
      if (!alive) return;
      if (res.ok && res.data) setRecent(res.data.results);
      else setError(res.error ?? "History is unavailable.");
    });
    return () => {
      alive = false;
    };
  }, [probe.id, probe.checkedAt, historyAvailable]);

  const entries = Object.entries(probe.details ?? {}).filter(([, v]) => v !== null && v !== "");
  return (
    <div className="space-y-4 border-t border-[var(--border)] bg-[var(--bg-sunken)]/50 px-4 py-4 text-[13px] sm:px-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">What this checks</p>
        <p className="mt-1 text-[var(--text-muted)]">{probe.description}</p>
        <p className="mt-1 text-[12px] text-[var(--text-subtle)]">Last run {fmtDateTime(probe.checkedAt)}</p>
      </div>

      {entries.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">Live values</p>
          <dl className="mt-1.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--border)] pb-1">
                <dt className="text-[var(--text-muted)]">{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt>
                <dd className="truncate font-mono text-[12.5px] text-[var(--text)]" title={String(v)}>
                  {typeof v === "boolean" ? (v ? "yes" : "no") : typeof v === "number" ? v.toLocaleString("en-US") : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">Recent results</p>
        {!historyAvailable ? (
          <p className="mt-1 text-[var(--text-muted)]">History is not available until the pending database migration is deployed.</p>
        ) : error ? (
          <p className="mt-1 text-[var(--danger)]">{error}</p>
        ) : recent === null ? (
          <p className="mt-1 text-[var(--text-muted)]">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="mt-1 text-[var(--text-muted)]">Nothing recorded yet. Press “Run probes now” to store a result.</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-[var(--border)]">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="w-44 shrink-0 font-mono text-[12px] text-[var(--text-muted)]">{fmtDateTime(r.createdAt)}</span>
                <StatusPill status={r.status} className="shrink-0" />
                <span className="w-16 shrink-0 text-right font-mono text-[12px] tabular-nums">{fmtMs(r.latencyMs)}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]" title={r.message}>{r.message}</span>
                <Badge className="shrink-0 text-[10px] uppercase">{r.trigger}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ProbeCard({ probe, stats, historyAvailable, actions }: { probe: HealthProbeResult; stats?: ProbeStats; historyAvailable: boolean; actions: ProbeActions }) {
  const [open, setOpen] = React.useState(false);
  return (
    <article className={cn("flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] shadow-[var(--shadow-card)]", probe.muted && "opacity-80")}>
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <CategoryIcon category={probe.category} />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{CATEGORY_LABEL[probe.category]}</span>
          </span>
          <span className="flex items-center gap-1.5">
            {probe.muted && <Badge className="text-[10px] uppercase">Muted</Badge>}
            <StatusPill status={probe.status} />
          </span>
        </div>

        <div>
          <h3 className="text-[16px] font-semibold text-[var(--text)]">{probe.name}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">{probe.message}</p>
        </div>

        <div className="mt-auto grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-3">
          <Metric label="Latency" value={probe.latencyMs !== undefined ? fmtMs(probe.latencyMs) : "—"} />
          <Metric label="Uptime" value={stats ? fmtPct(stats.availabilityPct) : "—"} />
          <Metric label="p95" value={stats ? fmtMs(stats.latency.p95) : "—"} />
        </div>

        <div className="space-y-1.5">
          {stats ? (
            <>
              <StatusStrip cells={stats.strip} />
              <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-subtle)]">
                <span>{stats.checks.toLocaleString("en-US")} check{stats.checks === 1 ? "" : "s"}</span>
                <LatencySpark points={stats.series} className="max-w-[140px]" />
              </div>
            </>
          ) : (
            <p className="text-[12px] text-[var(--text-subtle)]">{historyAvailable ? "No history in this period yet." : "History needs the pending migration."}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border)] px-2 py-1.5">
        <ProbeButtons probe={probe} actions={actions} open={open} onToggle={() => setOpen((v) => !v)} />
      </div>
      {open && <ProbeDetails probe={probe} historyAvailable={historyAvailable} />}
    </article>
  );
}

export function ProbeRow({ probe, stats, historyAvailable, actions }: { probe: HealthProbeResult; stats?: ProbeStats; historyAvailable: boolean; actions: ProbeActions }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <tr className={cn("border-t border-[var(--border)] align-middle", probe.muted && "opacity-80")}>
        <td className="px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-[var(--text)]">
              {probe.name} {probe.muted && <Badge className="ml-1 text-[10px] uppercase">Muted</Badge>}
            </p>
            <p className="truncate text-[12.5px] text-[var(--text-muted)]" title={probe.message}>{probe.message}</p>
          </div>
        </td>
        <td className="hidden px-3 py-3 md:table-cell">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
            <CategoryIcon category={probe.category} /> {CATEGORY_LABEL[probe.category]}
          </span>
        </td>
        <td className="px-3 py-3"><StatusPill status={probe.status} /></td>
        <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums">{probe.latencyMs !== undefined ? fmtMs(probe.latencyMs) : "—"}</td>
        <td className="hidden px-3 py-3 text-right font-mono text-[13px] tabular-nums lg:table-cell">{stats ? fmtMs(stats.latency.p95) : "—"}</td>
        <td className="hidden px-3 py-3 text-right font-mono text-[13px] tabular-nums sm:table-cell">{stats ? fmtPct(stats.availabilityPct) : "—"}</td>
        <td className="hidden w-44 px-3 py-3 xl:table-cell">{stats ? <StatusStrip cells={stats.strip} /> : null}</td>
        <td className="px-2 py-2 text-right"><ProbeButtons probe={probe} actions={actions} open={open} onToggle={() => setOpen((v) => !v)} /></td>
      </tr>
      {open && (
        <tr className="border-t border-[var(--border)]">
          <td colSpan={8} className="p-0"><ProbeDetails probe={probe} historyAvailable={historyAvailable} /></td>
        </tr>
      )}
    </>
  );
}
