import { runDueJobs } from "@/lib/adapters/queue";
import { runDueAutomations } from "@/lib/adapters/automations";
import { runMetricsRollup } from "@/lib/adapters/metrics-sync";
import { runSocialSync } from "@/lib/adapters/social-sync";
import { runDueRecycling } from "@/lib/adapters/recycling";
import { runDueReports } from "@/lib/reports-delivery";
import { runApprovalEscalations } from "@/lib/adapters/approval-escalation";
import { runJanitor } from "@/lib/janitor";
import { publishDueBlogPosts } from "@/lib/blog-publishing";
import { reconcileSubscriptions, type ReconcileResult } from "@/lib/billing-reconcile";
import { runNotificationJobs, type NotificationJobResult } from "@/lib/notifications/reminders";
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
  janitor: { verificationTokens: number; stalePresence: number; terminalJobs: number; orphanUploads: number; oldVisits: number; oldNotifications: number };
  blog?: { published: number };
  billing?: ReconcileResult;
  notifications?: NotificationJobResult;
  /** Housekeeping phases that did not start because the tick had used up its time budget; they run next tick. */
  skipped?: string[];
};

/**
 * How long a tick may spend before it stops STARTING housekeeping. Publishing and automations always run
 * first and are never skipped. The platform limit on the cron route is 60s (see maxDuration there), so this
 * leaves headroom for the phase already in flight to finish. Every skipped phase either self-throttles to a
 * schedule (rollup, reports, janitor, reconcile) or is cheap to repeat, so skipping one tick loses nothing.
 */
export const TICK_BUDGET_MS = 35_000;

export async function runScheduledWork(now: () => number = Date.now): Promise<TickResult> {
  const started = now();
  const skipped: string[] = [];

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

  // Every phase is isolated: one throwing must not skip the rest, and an automation throw must not sink
  // time-critical publishing. `budgeted` phases also stop being started once the tick is out of time.
  async function phase<T>(name: string, fn: () => Promise<T>, fallback: T, opts: { budgeted: boolean }): Promise<T> {
    if (opts.budgeted && now() - started > TICK_BUDGET_MS) {
      skipped.push(name);
      return fallback;
    }
    try {
      return await fn();
    } catch (err) {
      logger.error({ err }, `scheduled work: ${name} failed`);
      return fallback;
    }
  }
  const withTimeout = <T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> =>
    Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(onTimeout), ms))]);

  // Never skipped: publishing is the one time-critical job, automations are what users see react.
  const jobs = await phase("publish queue", () => runDueJobs(), { processed: 0 }, { budgeted: false });
  const autos = await phase("automations", () => runDueAutomations(), { ran: 0 }, { budgeted: false });

  const social = await phase("social sync", () => runSocialSync(), { metrics: 0, inbox: 0 }, { budgeted: true });
  const rollup = await phase("metrics rollup", () => runMetricsRollup(), { workspaces: 0 }, { budgeted: true });
  const recycling = await phase("evergreen recycling", () => runDueRecycling(), { scheduled: 0 }, { budgeted: true });
  const reports = await phase("report delivery", () => runDueReports(), { reports: 0, emails: 0 }, { budgeted: true });
  const approvalSla = await phase("approval SLA escalation", () => runApprovalEscalations(), { escalated: 0, autoApproved: 0, autoRejected: 0 }, { budgeted: true });
  // Janitor is throttled internally to hourly; cheap no-op most ticks.
  const janitor = await phase(
    "janitor",
    () => runJanitor(),
    { verificationTokens: 0, stalePresence: 0, terminalJobs: 0, orphanUploads: 0, oldVisits: 0, oldNotifications: 0 },
    { budgeted: true },
  );
  // Scheduled blog posts publishing
  const blog = await phase("blog publishing", () => publishDueBlogPosts(), { published: 0, postIds: [] as string[] }, { budgeted: true });

  // Reminders and nudges (upcoming/missed posts, drafts, milestones, expiring connections). Missed-post and
  // reminder timing matter, so this is not budgeted; it is cheap and indexed.
  const notifications = await phase("notification jobs", () => runNotificationJobs(), undefined as NotificationJobResult | undefined, { budgeted: false });

  // Billing reconciliation: ask the provider about subscriptions that should have renewed by now but whose
  // webhook never arrived. Throttled to every few hours inside, isolated, and a no-op without a billing provider.
  const billing = await phase(
    "billing reconciliation",
    () => withTimeout(reconcileSubscriptions(), 20_000, { checked: 0, corrected: 0, failed: 0 } as ReconcileResult),
    { checked: 0, corrected: 0, failed: 0 } as ReconcileResult,
    { budgeted: true },
  );

  // Health history: store a probe pass when the admin's "record every N minutes" interval has elapsed.
  // Dynamically imported, time-boxed and isolated so it can never delay or fail the tick.
  await phase(
    "health recording",
    () => withTimeout(import("@/lib/health/history").then((h) => h.recordScheduledHealthRun()), 20_000, false as unknown),
    undefined as unknown,
    { budgeted: true },
  );

  if (skipped.length > 0) logger.warn({ skipped, elapsedMs: now() - started }, "scheduled work: tick ran out of time, housekeeping deferred to the next tick");

  return {
    processed: jobs.processed,
    automations: autos.ran,
    social,
    rollup: rollup.workspaces,
    recycled: recycling.scheduled,
    reports,
    approvalSla,
    janitor,
    blog: { published: blog.published },
    billing,
    notifications,
    ...(skipped.length ? { skipped } : {}),
  };
}
