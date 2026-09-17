import { runDueJobs } from "@/lib/adapters/queue";
import { runDueAutomations } from "@/lib/adapters/automations";
import { runMetricsRollup } from "@/lib/adapters/metrics-sync";
import { runSocialSync } from "@/lib/adapters/social-sync";
import { runDueRecycling } from "@/lib/adapters/recycling";
import { runDueReports } from "@/lib/reports-delivery";
import { runApprovalEscalations } from "@/lib/adapters/approval-escalation";
import { db } from "@/lib/db";
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
  approvalSla: { escalated: number; autoApproved: number; autoRejected: number };
};

export async function runScheduledWork(): Promise<TickResult> {
  // Heartbeat for the staleness banner on /queue: if no worker/cron has run
  // recently, scheduled posts are sitting still and the user should know.
  // Best-effort — a stamp failure must never fail the tick itself.
  await db.systemSetting
    .upsert({
      where: { key: "tick_last_run" },
      create: { key: "tick_last_run", value: JSON.stringify(new Date().toISOString()) },
      update: { value: JSON.stringify(new Date().toISOString()) },
    })
    .catch((err) => logger.warn({ err }, "scheduled work: heartbeat stamp failed"));

  // Every phase is isolated: publishing used to share fate with automations,
  // so one throw in runDueAutomations silently skipped social sync, rollups,
  // recycling, reports and SLA for the whole tick — and vice versa, an
  // automation throw could sink time-critical publishing. Publishing still
  // runs first; it just can't take the tick down with it anymore.
  const jobs = await runDueJobs().catch((err) => {
    logger.error({ err }, "scheduled work: publish queue failed");
    return { processed: 0 };
  });
  const autos = await runDueAutomations().catch((err) => {
    logger.error({ err }, "scheduled work: automations failed");
    return { ran: 0 };
  });

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
  const approvalSla = await runApprovalEscalations().catch((err) => {
    logger.error({ err }, "scheduled work: approval SLA escalation failed");
    return { escalated: 0, autoApproved: 0, autoRejected: 0 };
  });

  return {
    processed: jobs.processed,
    automations: autos.ran,
    social,
    rollup: rollup.workspaces,
    recycled: recycling.scheduled,
    reports,
    approvalSla,
  };
}
