/**
 * Standalone publish worker. Deploy alongside the web app as a separate process:
 *
 *   node --import tsx scripts/worker.ts
 *
 * Or in Docker: `command: ["node", "--import", "tsx", "scripts/worker.ts"]`.
 * In dev the client-side TickPoller hitting /api/cron/tick covers this, so the
 * worker is only needed in production (or when testing the loop locally).
 */
import { runWorker } from "../src/lib/adapters/queue";

// Egress: the worker loop re-runs the full scheduled-work pipeline
// (queue + automations + sync + rollup reads) every interval against
// Supabase. 60s keeps publish granularity at a minute while cutting
// no-op pipeline runs 4x versus 15s. Override per deploy if needed.
const interval = Number(process.env.WORKER_INTERVAL_MS) || 60_000;

runWorker(interval).catch((e) => {
  console.error("worker crashed:", e);
  process.exit(1);
});
