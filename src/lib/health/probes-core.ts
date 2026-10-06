import { db } from "@/lib/db";
import { dbTimeout, mb, rateLatency, type ProbeDef } from "./probe-kit";

/**
 * Probes that read this app's own database: the DB itself, migrations, the
 * publish worker, the publishing pipeline, overdue posts and social tokens.
 * Every number comes from a live query at the moment the probe runs.
 */

const DAY = 86_400_000;
const sec = (ms: number) => Math.max(0, Math.round(ms / 1000));

export const databaseProbe: ProbeDef = {
  id: "database",
  name: "PostgreSQL Database",
  category: "core",
  description: "Times a real read and a real write against the primary database, then reads server version, size and open connections.",
  timeoutMs: dbTimeout,
  async run({ config }) {
    const t = config.thresholds;
    const start = performance.now();
    await db.$queryRaw`SELECT 1`;
    const readMs = Math.round(performance.now() - start);

    let writeMs: number | null = null;
    let writeError: string | null = null;
    const ws = performance.now();
    try {
      const stamp = JSON.stringify(new Date().toISOString());
      await db.systemSetting.upsert({
        where: { key: "health_write_probe" },
        create: { key: "health_write_probe", value: stamp },
        update: { value: stamp },
      });
      writeMs = Math.round(performance.now() - ws);
    } catch (err) {
      writeError = err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 120) : "write failed";
    }

    const details: Record<string, string | number | boolean | null> = { readMs, writeMs, writeOk: writeError === null };
    try {
      const rows = await db.$queryRaw<{ v: string; size: bigint; conns: bigint }[]>`
        SELECT version() AS v,
               pg_database_size(current_database()) AS size,
               (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS conns`;
      const row = rows[0];
      if (row) {
        details.version = row.v.split(" ").slice(0, 2).join(" ");
        details.sizeMB = mb(Number(row.size));
        details.openConnections = Number(row.conns);
      }
    } catch {
      /* some managed databases restrict catalog views; the read/write timings above are what matter */
    }

    const readRating = rateLatency(readMs, t.dbDegradedMs, t.dbUnhealthyMs);
    if (readRating === "unhealthy") return { status: "unhealthy", latencyMs: readMs, details, message: `Database answered in ${readMs}ms (limit ${t.dbUnhealthyMs}ms)` };
    if (writeError) return { status: "degraded", latencyMs: readMs, details, message: `Reads work (${readMs}ms) but a write failed: ${writeError}` };
    if (readRating === "degraded") return { status: "degraded", latencyMs: readMs, details, message: `Database is slow: ${readMs}ms read (slow above ${t.dbDegradedMs}ms)` };
    return { status: "healthy", latencyMs: readMs, details, message: `Read ${readMs}ms · write ${writeMs}ms` };
  },
};

export const migrationsProbe: ProbeDef = {
  id: "migrations",
  name: "Database Migrations",
  category: "core",
  description: "Reads Prisma's migration ledger and flags any migration that started but never finished.",
  timeoutMs: dbTimeout,
  async run() {
    try {
      const [summary] = await db.$queryRaw<{ total: number; failed: number; last_at: Date | null }[]>`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS failed,
               max(finished_at) AS last_at
        FROM _prisma_migrations`;
      const [latest] = await db.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
      const details = {
        applied: summary.total - summary.failed,
        failed: summary.failed,
        latest: latest?.migration_name ?? null,
        lastAppliedAt: summary.last_at ? summary.last_at.toISOString() : null,
      };
      if (summary.failed > 0) {
        return { status: "unhealthy", details, message: `${summary.failed} migration(s) started but never completed. Resolve with "prisma migrate resolve".` };
      }
      return { status: "healthy", details, message: `${details.applied} migrations applied${latest ? ` · latest ${latest.migration_name}` : ""}` };
    } catch (err) {
      const text = err instanceof Error ? err.message : "";
      if (/_prisma_migrations/.test(text) && /(does not exist|relation)/i.test(text)) {
        return { status: "skipped", message: "No migration ledger: this database's schema is managed outside Prisma Migrate." };
      }
      throw err;
    }
  },
};

export const workerProbe: ProbeDef = {
  id: "worker",
  name: "Background Queue Worker",
  category: "core",
  description: "Checks the scheduled-work heartbeat and the publish-job queue: waiting jobs, how late the oldest is, stuck jobs and failures in the last 24 hours.",
  timeoutMs: dbTimeout,
  async run({ config, now }) {
    const t = config.thresholds;
    const nowMs = now.getTime();
    const staleSec = t.workerStaleSec;
    const [stamp, queued, running, dueQueued, oldestDue, stuck, failed24h] = await Promise.all([
      db.systemSetting.findUnique({ where: { key: "tick_last_run" }, select: { value: true } }),
      db.publishJob.count({ where: { status: "queued" } }),
      db.publishJob.count({ where: { status: "running" } }),
      db.publishJob.count({ where: { status: "queued", runAt: { lte: now } } }),
      db.publishJob.findFirst({ where: { status: "queued", runAt: { lte: now } }, orderBy: { runAt: "asc" }, select: { runAt: true } }),
      db.publishJob.count({
        where: {
          status: "running",
          OR: [{ leaseUntil: { lt: now } }, { startedAt: { lt: new Date(nowMs - t.stuckJobMin * 60_000) } }],
        },
      }),
      db.publishJob.count({ where: { status: "failed", finishedAt: { gte: new Date(nowMs - DAY) } } }),
    ]);

    let tickAgeSec: number | null = null;
    if (stamp) {
      try {
        const at = Date.parse(JSON.parse(stamp.value) as string);
        if (Number.isFinite(at)) tickAgeSec = sec(nowMs - at);
      } catch {
        /* unreadable stamp is treated as "never ran" */
      }
    }
    const lagSec = oldestDue ? sec(nowMs - oldestDue.runAt.getTime()) : 0;
    const details = { tickAgeSec, queued, running, dueNow: dueQueued, oldestDueLagSec: lagSec, stuck, failed24h, staleAfterSec: staleSec };

    const open = `${queued} queued · ${running} running`;
    if (tickAgeSec === null) {
      return dueQueued > 0
        ? { status: "unhealthy", details, message: `The worker has never reported in and ${dueQueued} job(s) are due.` }
        : { status: "degraded", details, message: `No worker heartbeat recorded yet (${open}).` };
    }
    const stale = tickAgeSec > staleSec;
    if ((stale && dueQueued > 0 && lagSec > staleSec * 3) || stuck >= 5) {
      return { status: "unhealthy", details, message: `Worker last ran ${tickAgeSec}s ago; ${dueQueued} due job(s), oldest ${lagSec}s late; ${stuck} stuck.` };
    }
    if (stale || stuck > 0 || (dueQueued > 0 && lagSec > staleSec)) {
      const why = [stale && `heartbeat ${tickAgeSec}s old (limit ${staleSec}s)`, stuck > 0 && `${stuck} stuck job(s)`, dueQueued > 0 && lagSec > staleSec && `oldest due job ${lagSec}s late`]
        .filter(Boolean)
        .join(" · ");
      return { status: "degraded", details, message: `${why} · ${open}` };
    }
    return { status: "healthy", details, message: `Heartbeat ${tickAgeSec}s ago · ${open}${failed24h ? ` · ${failed24h} failed in 24h` : ""}` };
  },
};

export const publishingProbe: ProbeDef = {
  id: "publishing",
  name: "Publishing Success Rate",
  category: "application",
  description: "Compares posts published with posts that failed to publish over the last 24 hours.",
  timeoutMs: dbTimeout,
  async run({ config, now }) {
    const since = new Date(now.getTime() - DAY);
    const [published, failed] = await Promise.all([
      db.post.count({ where: { status: "published", publishedAt: { gte: since } } }),
      db.post.count({ where: { status: "failed", updatedAt: { gte: since } } }),
    ]);
    const total = published + failed;
    const ratePct = total === 0 ? 0 : Math.round((failed / total) * 1000) / 10;
    const details = { published24h: published, failed24h: failed, failureRatePct: ratePct, thresholdPct: config.thresholds.failureRatePct };
    if (total === 0) return { status: "healthy", details, message: "No publishing activity in the last 24 hours." };
    const limit = config.thresholds.failureRatePct;
    if (ratePct >= Math.max(limit * 2, 50) && failed >= 5) {
      return { status: "unhealthy", details, message: `${failed} of ${total} publishes failed (${ratePct}%) in 24h.` };
    }
    if (ratePct >= limit) return { status: "degraded", details, message: `${failed} of ${total} publishes failed (${ratePct}%, limit ${limit}%) in 24h.` };
    return { status: "healthy", details, message: `${published} published, ${failed} failed (${ratePct}%) in 24h.` };
  },
};

export const overdueProbe: ProbeDef = {
  id: "overdue",
  name: "Overdue Scheduled Posts",
  category: "application",
  description: "Counts posts whose scheduled time has passed by more than your limit and that are still unpublished.",
  timeoutMs: dbTimeout,
  async run({ config, now }) {
    const cutoff = new Date(now.getTime() - config.thresholds.overdueMin * 60_000);
    const where = { status: "scheduled", scheduledAt: { lt: cutoff } };
    const [count, oldest] = await Promise.all([
      db.post.count({ where }),
      db.post.findFirst({ where, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } }),
    ]);
    const lateMin = oldest?.scheduledAt ? Math.round((now.getTime() - oldest.scheduledAt.getTime()) / 60_000) : 0;
    const details = { overdue: count, oldestLateMin: lateMin, limitMin: config.thresholds.overdueMin };
    if (count === 0) return { status: "healthy", details, message: `Nothing is more than ${config.thresholds.overdueMin} min late.` };
    const status = count >= 10 ? "unhealthy" : "degraded";
    return { status, details, message: `${count} scheduled post(s) overdue; the oldest is ${lateMin} min late.` };
  },
};

export const socialProbe: ProbeDef = {
  id: "social",
  name: "Connected Social Accounts",
  category: "application",
  description: "Counts connected accounts that are broken, disconnected, expired or about to have their token expire.",
  timeoutMs: dbTimeout,
  async run({ config, now }) {
    const horizon = new Date(now.getTime() + config.thresholds.tokenExpiryDays * DAY);
    const [byStatus, expiring] = await Promise.all([
      db.socialAccount.groupBy({ by: ["status"], _count: { _all: true } }),
      db.socialAccount.count({ where: { status: "connected", tokenExpiresAt: { not: null, lte: horizon } } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<string, number>;
    const total = byStatus.reduce((n, r) => n + r._count._all, 0);
    const broken = (counts.error ?? 0) + (counts.expired ?? 0) + (counts.disconnected ?? 0);
    const details = { total, connected: counts.connected ?? 0, broken, expiringSoon: expiring, warnWithinDays: config.thresholds.tokenExpiryDays };
    if (total === 0) return { status: "skipped", details, message: "No social accounts are connected yet." };
    if (total >= 2 && broken / total > 0.5) return { status: "unhealthy", details, message: `${broken} of ${total} accounts need reconnecting.` };
    if (broken > 0 || expiring > 0) {
      const parts = [broken > 0 && `${broken} need reconnecting`, expiring > 0 && `${expiring} token(s) expire within ${config.thresholds.tokenExpiryDays}d`].filter(Boolean);
      return { status: "degraded", details, message: `${parts.join(" · ")} (of ${total}).` };
    }
    return { status: "healthy", details, message: `All ${total} connected accounts are healthy.` };
  },
};

export const CORE_PROBES: ProbeDef[] = [databaseProbe, migrationsProbe, workerProbe, publishingProbe, overdueProbe, socialProbe];
