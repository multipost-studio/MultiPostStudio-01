import { runDueJobs } from "@/lib/adapters/queue";
import { runDueAutomations } from "@/lib/adapters/automations";
import { runMetricsRollup } from "@/lib/adapters/metrics-sync";
import { runSocialSync } from "@/lib/adapters/social-sync";
import { runDueRecycling } from "@/lib/adapters/recycling";
import { runDueReports } from "@/lib/reports-delivery";
import { logger } from "@/lib/logger";

/**
 * The one definition of "a tick of scheduled work".
 *
 * Previously /api/cron/tick ran five jobs while scripts/worker.ts ran only
 * two, so a deployment using the worker without a cron silently lost social
 * sync, metrics rollups and scheduled report delivery — the behaviour of the
 * product depended on which process you happened to run.
 *
 * Both entrypoints now call this, so they cannot drift apart again.
 *
 * Running it twice concurrently is safe:
 *  - publish jobs are claimed with a compare-and-swap on status (see
 *    runDueJobs), so only one runner can take a given job;
 *  - the metrics rollup self-guards to once per workspace per day;
 *  - report delivery self-guards on each report's lastRunAt.
 *
 * Each auxiliary job is isolated: one failing must not stop publishing, which
 * is the only time-critical job here.
 */
export type TickResult = {
  processed: number;
  automations: number;
  social: { metrics: number; inbox: number };
  rollup: number;
  recycled: number;
  reports: { reports: number; emails: number };
};

export async function runScheduledWork(): Promise<TickResult> {
  // Publishing first and unguarded: if this throws the caller should know.
  const jobs = await runDueJobs();
  const autos = await runDueAutomations();

  const social = await runSocialSync().catch((err) => {
    logger.error({ err }, "scheduled work: social sync failed");
    return { metrics: 0, inbox: 0 };
  });
  const rollup = await runMetricsRollup().catch((err) => {
    logger.error({ err }, "scheduled work: metrics rollup failed");
    return { workspaces: 0 };
  });
  const recycling = await runDueRecycling().catch((err) => {
    logger.error({ err }, "scheduled work: evergreen recycling failed");
    return { scheduled: 0 };
  });
  const reports = await runDueReports().catch((err) => {
    logger.error({ err }, "scheduled work: report delivery failed");
    return { reports: 0, emails: 0 };
  });

  return {
    processed: jobs.processed,
    automations: autos.ran,
    social,
    rollup: rollup.workspaces,
    recycled: recycling.scheduled,
    reports,
  };
}
