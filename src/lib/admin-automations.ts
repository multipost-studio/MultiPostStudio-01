/**
 * Read-only status of the scheduled jobs. The scheduler stamps a SystemSetting row each time a job really runs
 * (JSON-encoded ISO time, or a calendar date for the weekly digest); this turns a stamp into "healthy / late / never".
 * Nothing here runs, pauses or changes a job: that is deliberate, there is no per-job switch in the product to wire to.
 */
export type JobDef = {
  key: string;
  name: string;
  description: string;
  /** SystemSetting key the job writes when it runs. */
  stamp: string;
  /** How often it is meant to run, in words. */
  cadence: string;
  /** Older than this and it is reported late. Deliberately generous: late means a missed run, not a slow one. */
  lateAfterMs: number;
  /** Set when the job is a no-op unless an integration is configured. */
  needs?: "billing";
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const JOBS: readonly JobDef[] = [
  { key: "tick", name: "Scheduled work tick", description: "Publishes due posts and runs every job below. If this is late, nothing scheduled is running.", stamp: "tick_last_run", cadence: "every few minutes (set by whatever calls /api/cron/tick)", lateAfterMs: 15 * MIN },
  { key: "social-metrics", name: "Social metrics sync", description: "Pulls post analytics from connected accounts.", stamp: "social_sync_metrics_last_run", cadence: "at most every 10 minutes", lateAfterMs: 3 * HOUR },
  { key: "social-inbox", name: "Social inbox sync", description: "Pulls comments and messages from connected accounts.", stamp: "social_sync_inbox_last_run", cadence: "at most every 90 seconds", lateAfterMs: 3 * HOUR },
  { key: "janitor", name: "Housekeeping", description: "Deletes expired tokens, stale presence, finished jobs, orphan uploads, old visits and notifications.", stamp: "janitor_last_run", cadence: "hourly", lateAfterMs: 3 * HOUR },
  { key: "notifications", name: "Reminder and nudge jobs", description: "Upcoming and missed post reminders, draft nudges, milestones and expiring connections.", stamp: "notifications_last_hourly", cadence: "hourly", lateAfterMs: 3 * HOUR },
  { key: "billing", name: "Billing reconciliation", description: "Asks the payment provider about subscriptions whose renewal webhook never arrived.", stamp: "billing_reconcile_last_run", cadence: "every 6 hours", lateAfterMs: 24 * HOUR, needs: "billing" },
  { key: "digest", name: "Weekly digest", description: "Sends each workspace its weekly summary email.", stamp: "digest_last_sent", cadence: "weekly (/api/cron/digest)", lateAfterMs: 8 * DAY },
];

export type JobState = "healthy" | "late" | "never" | "not-configured";
export type JobStatus = { state: JobState; lastRunAt: Date | null; ageMs: number | null };

/** Parse a stamp value the way the jobs write it; anything unreadable counts as "never ran". */
export function parseStamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v !== "string") return null;
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t) : null;
  } catch {
    return null;
  }
}

export function jobStatus(def: JobDef, raw: string | null | undefined, now: Date, billingConfigured: boolean): JobStatus {
  if (def.needs === "billing" && !billingConfigured) return { state: "not-configured", lastRunAt: null, ageMs: null };
  const last = parseStamp(raw);
  if (!last) return { state: "never", lastRunAt: null, ageMs: null };
  const ageMs = Math.max(0, now.getTime() - last.getTime());
  return { state: ageMs > def.lateAfterMs ? "late" : "healthy", lastRunAt: last, ageMs };
}

export function formatAge(ms: number): string {
  const m = Math.floor(ms / MIN);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}
