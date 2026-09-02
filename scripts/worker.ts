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

const interval = Number(process.env.WORKER_INTERVAL_MS) || 15_000;

runWorker(interval).catch((e) => {
  console.error("worker crashed:", e);
  process.exit(1);
});
