"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { PROBE_BY_ID, buildReport, runProbe, runSystemHealthProbes } from "@/lib/health/run";
import { PROBE_IDS, parseHealthConfig, type HealthConfig, type ProbeId } from "@/lib/health/config";
import { CONFIG_KEY, loadHealthConfig, loadHealthState, resetHealthConfig, saveHealthConfig } from "@/lib/health/config-store";
import { historyAvailable, pruneHealthHistory, recordHealthRun, toStored } from "@/lib/health/history";
import { loadOverviewStats, type OverviewStats } from "@/lib/health/overview";
import { RANGES, type HealthRange, type StoredProbeResult, type SystemHealthReport, type HealthProbeResult } from "@/lib/health/types";
import { ok, type ActionResult } from "./_helpers";

const fail = <T>(error: string): ActionResult<T> => ({ ok: false, error });

const MAX_IMPORT_BYTES = 20_000;
/** Background refreshes only write history when the last write is older than this. */
const AUTO_RECORD_GAP_MS = 120_000;

function refresh() {
  revalidatePath("/admin/health");
}

/**
 * Runs every probe now. `auto` marks a timer-driven refresh: those still return
 * fresh data but only add a history row when the previous one is old enough,
 * so leaving the page open does not flood the table.
 */
export async function triggerHealthProbesAction(opts: { auto?: boolean } = {}): Promise<ActionResult<{ report: SystemHealthReport; recorded: boolean }>> {
  try {
    const admin = await requireAdminPermission("system.manage");
    const report = await runSystemHealthProbes();
    let recorded = false;
    if (!opts.auto) {
      recorded = (await recordHealthRun(report, { trigger: "manual", actorId: admin.id })) !== null;
    } else {
      const last = (await loadHealthState()).lastRecordedAt;
      if (!last || Date.now() - Date.parse(last) >= AUTO_RECORD_GAP_MS) {
        recorded = (await recordHealthRun(report, { trigger: "auto", actorId: admin.id })) !== null;
      }
    }
    return ok({ report, recorded });
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "run health probes failed");
    return fail("Couldn't run the health probes.");
  }
}

/** Re-run a single probe (e.g. after fixing something) without waiting for the full pass. */
export async function runSingleProbeAction(probeId: string): Promise<ActionResult<{ probe: HealthProbeResult; recorded: boolean }>> {
  try {
    const admin = await requireAdminPermission("system.manage");
    const def = PROBE_BY_ID[probeId];
    if (!def) return fail("Unknown probe.");
    const config = await loadHealthConfig();
    const probe = await runProbe(def, config);
    const recorded = (await recordHealthRun(buildReport([probe]), { trigger: "manual", actorId: admin.id })) !== null;
    return ok({ probe, recorded });
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err, probeId }, "run single probe failed");
    return fail("Couldn't run that probe.");
  }
}

export type ConfigResult = { ok: true; config: HealthConfig; message: string } | { ok: false; errors: string[] };

async function applyConfig(config: HealthConfig, actorId: string, action: string, extra: Record<string, unknown> = {}): Promise<ConfigResult> {
  const before = await loadHealthConfig();
  await saveHealthConfig(config, actorId);
  await logAudit({ actorId, action, targetType: "system", targetId: CONFIG_KEY, metadata: { before, after: config, ...extra } });
  refresh();
  return { ok: true, config, message: "Health settings saved" };
}

export async function saveHealthConfigAction(input: unknown): Promise<ConfigResult> {
  const admin = await requireAdminPermission("system.manage");
  const parsed = parseHealthConfig(input);
  if (!parsed.ok) return parsed;
  try {
    return await applyConfig(parsed.config, admin.id, "admin.health_config_updated");
  } catch (err) {
    logger.error({ err }, "save health config failed");
    return { ok: false, errors: ["Couldn't save the settings."] };
  }
}

/** Import a config exported from this page (or another environment). All-or-nothing. */
export async function importHealthConfigAction(text: string): Promise<ConfigResult> {
  const admin = await requireAdminPermission("system.manage");
  if (typeof text !== "string" || text.length === 0) return { ok: false, errors: ["The file is empty."] };
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: [`The file is larger than ${MAX_IMPORT_BYTES / 1000} KB.`] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
  // Accept the export envelope as well as a bare config object.
  const candidate = raw && typeof raw === "object" && "config" in raw && !("thresholds" in raw) ? (raw as { config: unknown }).config : raw;
  const parsed = parseHealthConfig(candidate);
  if (!parsed.ok) return parsed;
  try {
    const res = await applyConfig(parsed.config, admin.id, "admin.health_config_imported");
    return res.ok ? { ...res, message: "Health settings imported" } : res;
  } catch (err) {
    logger.error({ err }, "import health config failed");
    return { ok: false, errors: ["Couldn't save the imported settings."] };
  }
}

export async function resetHealthConfigAction(): Promise<ActionResult<{ config: HealthConfig }>> {
  try {
    const admin = await requireAdminPermission("system.manage");
    const before = await loadHealthConfig();
    await resetHealthConfig();
    const config = await loadHealthConfig();
    await logAudit({ actorId: admin.id, action: "admin.health_config_reset", targetType: "system", targetId: CONFIG_KEY, metadata: { before } });
    refresh();
    return ok({ config }, "Health settings reset to defaults");
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "reset health config failed");
    return fail("Couldn't reset the settings.");
  }
}

/** Delete history older than N days (0 = everything). Audited. */
export async function pruneHealthHistoryAction(olderThanDays: number): Promise<ActionResult<{ deleted: number }>> {
  try {
    const admin = await requireAdminPermission("system.manage");
    if (!Number.isInteger(olderThanDays) || olderThanDays < 0 || olderThanDays > 365) return fail("Choose between 0 and 365 days.");
    if (!(await historyAvailable())) return fail("The history table is not available yet. Deploy the pending migration first.");
    const deleted = await pruneHealthHistory(olderThanDays);
    await logAudit({ actorId: admin.id, action: "admin.health_history_pruned", targetType: "system", targetId: "HealthProbeRun", metadata: { olderThanDays, deleted } });
    refresh();
    return ok({ deleted }, deleted === 1 ? "Deleted 1 record" : `Deleted ${deleted} records`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "prune health history failed");
    return fail("Couldn't delete the history.");
  }
}

/** Fresh history-derived figures for the overview (uptime, strips, incidents) after a run. */
export async function getHealthStatsAction(range: string): Promise<ActionResult<OverviewStats>> {
  try {
    await requireAdminPermission("system.view");
    const r: HealthRange = (RANGES as readonly string[]).includes(range) ? (range as HealthRange) : "24h";
    const config = await loadHealthConfig();
    return ok(await loadOverviewStats(r, config.muted));
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail("Couldn't load history.");
  }
}

/** The recent results of one probe, for its detail panel. */
export async function getProbeHistoryAction(probeId: string, limit = 25): Promise<ActionResult<{ results: StoredProbeResult[] }>> {
  try {
    await requireAdminPermission("system.view");
    if (!(PROBE_IDS as readonly string[]).includes(probeId as ProbeId)) return fail("Unknown probe.");
    const take = Math.min(100, Math.max(1, Math.floor(limit)));
    const rows = await db.healthProbeRun.findMany({
      where: { probeId },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, runId: true, probeId: true, name: true, category: true, status: true, latencyMs: true, message: true, trigger: true, createdAt: true },
    });
    return ok({ results: rows.map(toStored) });
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail("History isn't available yet.");
  }
}

function isRedirect(err: unknown): boolean {
  return typeof err === "object" && err !== null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
