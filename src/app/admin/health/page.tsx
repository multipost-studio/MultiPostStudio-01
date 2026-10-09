import type { Metadata } from "next";
import Link from "next/link";
import { HeartPulse, Clock, ShieldAlert, Timer, Siren } from "lucide-react";
import { requireAdminPermission } from "@/lib/session";
import { parseAdminQuery, type RawParams } from "@/lib/admin-query";
import { KpiTile } from "@/components/ui/kpi-tile";
import { cn } from "@/lib/utils";
import { deriveIncidents, filterIncidents, formatDuration, summarizeIncidents } from "@/lib/health/analytics";
import { loadHealthConfig, loadHealthState } from "@/lib/health/config-store";
import {
  historyAvailable,
  historyCounts,
  loadRangeRows,
  parseHistoryFilters,
  queryHistory,
  recordHealthRun,
  type HistorySort,
} from "@/lib/health/history";
import { loadOverviewStats } from "@/lib/health/overview";
import { PROBES, runSystemHealthProbes } from "@/lib/health/run";
import { RANGES, RANGE_LABEL, RANGE_MS, type HealthRange } from "@/lib/health/types";
import { HealthOverview } from "./health-overview";
import { HealthSettings } from "./health-settings";
import { HealthToolbar } from "./health-toolbar";
import { Empty, HistoryTable, IncidentsTable } from "./_tables";

export const metadata: Metadata = { title: "Admin · Health Probes" };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History" },
  { id: "incidents", label: "Incidents" },
  { id: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Page views add a history row only if the last one is older than this. */
const PAGE_RECORD_GAP_MS = 120_000;
const INCIDENT_CAP = 300;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const asRange = (v: string | undefined, fallback: HealthRange): HealthRange => ((RANGES as readonly string[]).includes(v ?? "") ? (v as HealthRange) : fallback);

export default async function AdminHealthPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireAdminPermission("system.view");
  const raw = await searchParams;
  const tabParam = one(raw.tab);
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "overview";
  const config = await loadHealthConfig();
  const probeOptions = PROBES.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-[40px]">
          <HeartPulse className="h-8 w-8 shrink-0 text-[var(--primary)]" aria-hidden /> Health Probes
        </h1>
        <p className="mt-1 max-w-3xl text-[15px] text-[var(--text-muted)]">
          Live checks of the database, queue, storage, email, billing and more. Every result is measured when it runs, stored for history, and turned into uptime, incidents and alerts.
        </p>
      </div>

      <nav aria-label="Health sections" className="inline-flex max-w-full overflow-x-auto rounded-full border border-[var(--border)]/70 bg-[var(--bg-sunken)] p-1">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "overview" ? "/admin/health" : `/admin/health?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-full px-4 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
              tab === t.id ? "bg-[var(--text)] text-[var(--bg-elevated)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab raw={raw} config={config} />}
      {tab === "history" && <HistoryTab raw={raw} probeOptions={probeOptions} />}
      {tab === "incidents" && <IncidentsTab raw={raw} probeOptions={probeOptions} mutedIds={config.muted} />}
      {tab === "settings" && <SettingsTab config={config} />}
    </div>
  );
}

async function OverviewTab({ raw, config }: { raw: RawParams; config: Awaited<ReturnType<typeof loadHealthConfig>> }) {
  const range = asRange(one(raw.range), "24h");
  const report = await runSystemHealthProbes({ config });

  // A page view stores a result too (throttled), so history keeps filling even if
  // no worker is running. Failure to store never affects the page.
  let state = await loadHealthState();
  const last = state.lastRecordedAt ? Date.parse(state.lastRecordedAt) : 0;
  if (Date.now() - last >= PAGE_RECORD_GAP_MS && (await historyAvailable())) {
    if (await recordHealthRun(report, { trigger: "page" })) state = await loadHealthState();
  }
  const stats = await loadOverviewStats(range, config.muted);

  return <HealthOverview key={range} initialReport={report} initialStats={stats} initialConfig={config} range={range} lastRecordedAt={state.lastRecordedAt ?? null} />;
}

async function HistoryTab({ raw, probeOptions }: { raw: RawParams; probeOptions: { id: string; name: string }[] }) {
  const available = await historyAvailable();
  const query = parseAdminQuery(raw, { defaultSort: "createdAt", sortable: ["createdAt", "latencyMs", "name"], defaultPerPage: 50 });
  const filters = parseHistoryFilters((k) => one(raw[k]));
  const { rows, total } = available
    ? await queryHistory(filters, { skip: query.skip, take: query.perPage, sort: query.sort as HistorySort, dir: query.dir })
    : { rows: [], total: 0 };

  return (
    <div className="space-y-4">
      <HealthToolbar mode="history" probes={probeOptions} />
      {!available ? (
        <Empty title="History isn't recording yet">The HealthProbeRun table is created by the pending migration on your next deploy. Probes keep running live in the meantime.</Empty>
      ) : (
        <>
          <p className="text-[13px] text-[var(--text-muted)]">{total.toLocaleString("en-US")} stored result{total === 1 ? "" : "s"} match.</p>
          <HistoryTable rows={rows} total={total} page={query.page} perPage={query.perPage} />
        </>
      )}
    </div>
  );
}

async function IncidentsTab({ raw, probeOptions, mutedIds }: { raw: RawParams; probeOptions: { id: string; name: string }[]; mutedIds: string[] }) {
  const available = await historyAvailable();
  const filters = parseHistoryFilters((k) => one(raw[k]));
  const range = asRange(one(raw.range), "7d");
  const to = filters.to ?? new Date();
  const from = filters.from ?? new Date(to.getTime() - RANGE_MS[range]);
  const stateParam = one(raw.state);
  const state = stateParam === "open" || stateParam === "resolved" ? stateParam : "";

  let incidents: ReturnType<typeof deriveIncidents> = [];
  if (available) {
    const { rows } = await loadRangeRows(from, to, filters.probes);
    incidents = filterIncidents(deriveIncidents(rows, Date.now()), { severities: filters.statuses, categories: filters.categories, probes: filters.probes, state, q: filters.q });
  }
  const summary = summarizeIncidents(incidents);
  const mutedOpen = incidents.filter((i) => i.resolvedAt === null && mutedIds.includes(i.probeId)).length;

  return (
    <div className="space-y-4">
      <HealthToolbar mode="incidents" probes={probeOptions} />
      {!available ? (
        <Empty title="Incidents need history">Incidents are detected from stored results. They appear once the pending migration is deployed and probes have run.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <KpiTile hero label={`Incidents · ${filters.from || filters.to ? "custom range" : RANGE_LABEL[range].toLowerCase()}`} icon={<Siren size={17} />} value={String(summary.total)} hint={`${summary.resolved} resolved`} />
            <KpiTile label="Open now" icon={<ShieldAlert size={17} />} value={String(summary.open)} hint={mutedOpen ? `${mutedOpen} on muted probes` : summary.open ? "still unresolved" : "all clear"} />
            <KpiTile label="Mean time to recover" icon={<Timer size={17} />} value={summary.meanTimeToRecoverMs === null ? "—" : formatDuration(summary.meanTimeToRecoverMs)} hint="resolved incidents only" />
            <KpiTile label="Longest" icon={<Clock size={17} />} value={summary.longestMs === null ? "—" : formatDuration(summary.longestMs)} hint="including open ones" />
          </div>
          <IncidentsTable incidents={incidents.slice(0, INCIDENT_CAP)} capped={incidents.length > INCIDENT_CAP} />
        </>
      )}
    </div>
  );
}

async function SettingsTab({ config }: { config: Awaited<ReturnType<typeof loadHealthConfig>> }) {
  const available = await historyAvailable();
  const counts = available ? await historyCounts() : { total: 0, oldest: null, newest: null };
  return (
    <HealthSettings
      initialConfig={config}
      probes={PROBES.map((p) => ({ id: p.id, name: p.name, category: p.category, description: p.description }))}
      history={{ available, ...counts }}
    />
  );
}
