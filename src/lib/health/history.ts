import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { loadHealthConfig, loadHealthState, saveHealthState } from "./config-store";
import { runSystemHealthProbes } from "./run";
import {
  PROBE_CATEGORIES,
  PROBE_STATUSES,
  TRIGGERS,
  type ProbeCategory,
  type ProbeStatus,
  type RunTrigger,
  type StoredProbeResult,
  type SystemHealthReport,
} from "./types";

/**
 * Persistence for probe results. Every function here is written so that a
 * missing table (the migration has not been deployed yet) or a database blip
 * degrades the history features only: running probes must keep working.
 */

const MAX_RANGE_ROWS = 60_000;
const DAY = 86_400_000;

export function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = String((err as Error | null)?.message ?? "");
  return code === "P2021" || (/HealthProbeRun/.test(message) && /does not exist/i.test(message));
}

type Row = {
  id: string;
  runId: string;
  probeId: string;
  name: string;
  category: string;
  status: string;
  latencyMs: number | null;
  message: string;
  trigger: string;
  createdAt: Date;
};

const asStatus = (s: string): ProbeStatus => (PROBE_STATUSES as string[]).includes(s) ? (s as ProbeStatus) : "unhealthy";
const asCategory = (c: string): ProbeCategory => (PROBE_CATEGORIES as string[]).includes(c) ? (c as ProbeCategory) : "core";

export const toStored = (r: Row): StoredProbeResult => ({
  id: r.id,
  runId: r.runId,
  probeId: r.probeId,
  name: r.name,
  category: asCategory(r.category),
  status: asStatus(r.status),
  latencyMs: r.latencyMs,
  message: r.message,
  trigger: r.trigger,
  createdAt: r.createdAt.toISOString(),
});

const SELECT = { id: true, runId: true, probeId: true, name: true, category: true, status: true, latencyMs: true, message: true, trigger: true, createdAt: true } as const;

/** Whether the history table exists and is readable. */
export async function historyAvailable(): Promise<boolean> {
  try {
    await db.healthProbeRun.findFirst({ select: { id: true } });
    return true;
  } catch (err) {
    if (!isMissingTable(err)) logger.warn({ err }, "health history unavailable");
    return false;
  }
}

/** Writes one row per probe. Returns the run id, or null when history could not be written. */
export async function recordHealthRun(
  report: SystemHealthReport,
  opts: { trigger: RunTrigger; actorId?: string | null },
): Promise<string | null> {
  const runId = randomUUID();
  try {
    await db.healthProbeRun.createMany({
      data: report.probes.map((p) => ({
        runId,
        probeId: p.id,
        name: p.name,
        category: p.category,
        status: p.status,
        latencyMs: typeof p.latencyMs === "number" ? Math.round(p.latencyMs) : null,
        message: p.message.slice(0, 500),
        details: p.details ? JSON.stringify(p.details) : null,
        trigger: opts.trigger,
        actorId: opts.actorId ?? null,
        createdAt: new Date(p.checkedAt),
      })),
    });
    await saveHealthState({ lastRecordedAt: new Date().toISOString() });
    const config = await loadHealthConfig();
    await pruneIfDue(config.retentionDays);
    return runId;
  } catch (err) {
    if (!isMissingTable(err)) logger.error({ err }, "health: failed to record run");
    return null;
  }
}

async function pruneIfDue(retentionDays: number): Promise<void> {
  const state = await loadHealthState();
  const last = state.lastPrunedAt ? Date.parse(state.lastPrunedAt) : 0;
  if (Date.now() - last < DAY) return;
  await pruneHealthHistory(retentionDays);
  await saveHealthState({ lastPrunedAt: new Date().toISOString() });
}

export async function pruneHealthHistory(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * DAY);
  const res = await db.healthProbeRun.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return res.count;
}

/**
 * Called from the scheduled-work tick. Runs and stores a full probe pass only
 * when the admin's "record every N minutes" interval has elapsed, so history
 * accumulates without anyone having the page open. Returns true if it recorded.
 */
export async function recordScheduledHealthRun(): Promise<boolean> {
  const config = await loadHealthConfig();
  if (config.recordEveryMin === 0) return false;
  const state = await loadHealthState();
  const last = state.lastRecordedAt ? Date.parse(state.lastRecordedAt) : 0;
  if (Date.now() - last < config.recordEveryMin * 60_000) return false;
  // Claim the slot first so concurrent ticks do not each run a full pass.
  await saveHealthState({ lastRecordedAt: new Date().toISOString() });
  const report = await runSystemHealthProbes({ config });
  return (await recordHealthRun(report, { trigger: "tick" })) !== null;
}

export type HistoryFilters = {
  from?: Date;
  to?: Date;
  probes: string[];
  statuses: ProbeStatus[];
  categories: ProbeCategory[];
  triggers: RunTrigger[];
  q: string;
};

export function historyWhere(f: HistoryFilters): Prisma.HealthProbeRunWhereInput {
  const where: Prisma.HealthProbeRunWhereInput = {};
  if (f.from || f.to) where.createdAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  if (f.probes.length) where.probeId = { in: f.probes };
  if (f.statuses.length) where.status = { in: f.statuses };
  if (f.categories.length) where.category = { in: f.categories };
  if (f.triggers.length) where.trigger = { in: f.triggers };
  if (f.q) where.OR = [{ message: { contains: f.q, mode: "insensitive" } }, { name: { contains: f.q, mode: "insensitive" } }];
  return where;
}

export type HistorySort = "createdAt" | "latencyMs" | "name";

export async function queryHistory(
  f: HistoryFilters,
  page: { skip: number; take: number; sort: HistorySort; dir: "asc" | "desc" },
): Promise<{ rows: StoredProbeResult[]; total: number }> {
  const where = historyWhere(f);
  const orderBy: Prisma.HealthProbeRunOrderByWithRelationInput =
    page.sort === "latencyMs" ? { latencyMs: { sort: page.dir, nulls: "last" } } : page.sort === "name" ? { name: page.dir } : { createdAt: page.dir };
  const [rows, total] = await Promise.all([
    db.healthProbeRun.findMany({ where, orderBy: [orderBy, { id: "desc" }], skip: page.skip, take: page.take, select: SELECT }),
    db.healthProbeRun.count({ where }),
  ]);
  return { rows: rows.map(toStored), total };
}

/** All results in a window (oldest first), for stats, strips and incidents. */
export async function loadRangeRows(from: Date, to: Date, probes: string[] = []): Promise<{ rows: StoredProbeResult[]; truncated: boolean }> {
  const rows = await db.healthProbeRun.findMany({
    where: { createdAt: { gte: from, lte: to }, ...(probes.length ? { probeId: { in: probes } } : {}) },
    orderBy: { createdAt: "asc" },
    take: MAX_RANGE_ROWS + 1,
    select: SELECT,
  });
  const truncated = rows.length > MAX_RANGE_ROWS;
  return { rows: (truncated ? rows.slice(0, MAX_RANGE_ROWS) : rows).map(toStored), truncated };
}

/** Most recent stored result per probe within `sinceMs`. Used by the sidebar alert signal. */
export async function latestResultPerProbe(sinceMs: number): Promise<StoredProbeResult[]> {
  const rows = await db.healthProbeRun.findMany({
    where: { createdAt: { gte: new Date(Date.now() - sinceMs) } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: SELECT,
  });
  const seen = new Set<string>();
  const out: StoredProbeResult[] = [];
  for (const r of rows) {
    if (seen.has(r.probeId)) continue;
    seen.add(r.probeId);
    out.push(toStored(r));
  }
  return out;
}

export async function historyCounts(): Promise<{ total: number; oldest: string | null; newest: string | null }> {
  const [total, oldest, newest] = await Promise.all([
    db.healthProbeRun.count(),
    db.healthProbeRun.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.healthProbeRun.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return { total, oldest: oldest?.createdAt.toISOString() ?? null, newest: newest?.createdAt.toISOString() ?? null };
}

/** Parses the shared filter query-string into typed filters, dropping anything unknown. */
export function parseHistoryFilters(get: (key: string) => string | null | undefined, now = new Date()): HistoryFilters {
  const list = (k: string) => (get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const date = (k: string, endOfDay: boolean): Date | undefined => {
    const v = get(k);
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
    const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const from = date("from", false);
  const to = date("to", true);
  return {
    from,
    to: to && to.getTime() > now.getTime() ? now : to,
    probes: list("probe"),
    statuses: list("status").filter((s): s is ProbeStatus => (PROBE_STATUSES as string[]).includes(s)),
    categories: list("category").filter((c): c is ProbeCategory => (PROBE_CATEGORIES as string[]).includes(c)),
    triggers: list("trigger").filter((t): t is RunTrigger => (TRIGGERS as readonly string[]).includes(t)),
    q: (get("q") ?? "").trim().slice(0, 100),
  };
}
