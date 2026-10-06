import { buildProbeStats, deriveIncidents, runAvailability, type ProbeStats, type RunAvailability } from "./analytics";
import { historyAvailable, isMissingTable, loadRangeRows } from "./history";
import { RANGE_MS, type HealthRange } from "./types";
import { logger } from "@/lib/logger";

export type OverviewStats = {
  /** False when the history table is missing (migration not deployed): everything else is empty. */
  available: boolean;
  stats: Record<string, ProbeStats>;
  availability: RunAvailability;
  openIncidents: number;
  /** True when the window held more rows than we read, so figures cover the most recent part only. */
  truncated: boolean;
};

const EMPTY: OverviewStats = {
  available: false,
  stats: {},
  availability: { runs: 0, healthyPct: null, availabilityPct: null },
  openIncidents: 0,
  truncated: false,
};

/** Everything the overview needs from stored history for one time range. */
export async function loadOverviewStats(range: HealthRange, mutedIds: string[]): Promise<OverviewStats> {
  try {
    if (!(await historyAvailable())) return EMPTY;
    const to = new Date();
    const from = new Date(to.getTime() - RANGE_MS[range]);
    const { rows, truncated } = await loadRangeRows(from, to);
    return {
      available: true,
      stats: buildProbeStats(rows, { from: from.getTime(), to: to.getTime() }),
      availability: runAvailability(rows, mutedIds),
      openIncidents: deriveIncidents(rows, to.getTime()).filter((i) => i.resolvedAt === null && !mutedIds.includes(i.probeId)).length,
      truncated,
    };
  } catch (err) {
    if (!isMissingTable(err)) logger.error({ err }, "health: overview stats failed");
    return EMPTY;
  }
}
