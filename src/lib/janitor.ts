import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export type JanitorResult = {
  verificationTokens: number;
  stalePresence: number;
  terminalJobs: number;
  orphanUploads: number;
};

const JANITOR_MIN_INTERVAL_MS = 60 * 60_000; // at most once an hour
const TERMINAL_JOB_RETENTION_DAYS = 90;

/**
 * Garbage collection for rows that are unambiguous waste. Runs as an
 * isolated tick phase (a janitor failure must never fail publishing).
 * Throttled to hourly via a systemSetting stamp.
 *
 * Deliberately NOT pruned here (need a retention policy first):
 * Notification, WebhookDelivery, AuditLog, AutomationRun, PostMetric —
 * all business history. Expired PortalLinks/report shares are kept too
 * (revocation is manual; expiry only blocks use).
 */
export async function runJanitor(now = new Date()): Promise<JanitorResult> {
  const empty: JanitorResult = { verificationTokens: 0, stalePresence: 0, terminalJobs: 0, orphanUploads: 0 };

  const stamp = await db.systemSetting
    .findUnique({ where: { key: "janitor_last_run" }, select: { value: true } })
    .catch(() => null);
  const last = stamp ? Date.parse(JSON.parse(stamp.value) as string) : 0;
  if (Number.isFinite(last) && now.getTime() - last < JANITOR_MIN_INTERVAL_MS) return empty;
  await db.systemSetting
    .upsert({
      where: { key: "janitor_last_run" },
      create: { key: "janitor_last_run", value: JSON.stringify(now.toISOString()) },
      update: { value: JSON.stringify(now.toISOString()) },
    })
    .catch((err) => logger.warn({ err }, "janitor: stamp failed"));

  try {
    // Expired invite/reset tokens can never be used again.
    const tokens = await db.verificationToken.deleteMany({ where: { expires: { lt: now } } });
    empty.verificationTokens = tokens.count;
  } catch (err) {
    logger.warn({ err }, "janitor: verification tokens failed");
  }

  try {
    // Presence heartbeats older than 5 minutes: readers already ignore
    // anything over 45s (STALE_MS), so these rows are pure growth.
    const presence = await db.conversationPresence.deleteMany({
      where: { updatedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
    });
    empty.stalePresence = presence.count;
  } catch (err) {
    logger.warn({ err }, "janitor: stale presence failed");
  }

  try {
    // Terminal publish jobs older than the retention window. Recent terminal
    // rows stay (queue history, retry forensics).
    const cutoff = new Date(now.getTime() - TERMINAL_JOB_RETENTION_DAYS * 86_400_000);
    const jobs = await db.publishJob.deleteMany({
      where: { status: { in: ["done", "failed", "canceled"] }, finishedAt: { lt: cutoff } },
    });
    empty.terminalJobs = jobs.count;
  } catch (err) {
    logger.warn({ err }, "janitor: terminal jobs failed");
  }

  try {
    empty.orphanUploads = await sweepOrphanUploads(now);
  } catch (err) {
    logger.warn({ err }, "janitor: orphan uploads failed");
  }

  const total = empty.verificationTokens + empty.stalePresence + empty.terminalJobs + empty.orphanUploads;
  if (total > 0) logger.info({ ...empty }, "janitor collected garbage");
  return empty;
}

/**
 * Delete stored objects that were PUT via presigned URL but never registered
 * as media assets (abandoned uploads, failed registrations), plus orphaned
 * thumbnails (asset deletion removes only the main key). Triple-guarded:
 * only the uploads/ and thumbnails/ prefixes, only objects older than 7
 * days, only keys with no MediaAsset referencing them as url or thumbUrl,
 * max 100 per run.
 * S3-backed storage only; local dev files are harmless disk usage.
 */
async function sweepOrphanUploads(now: Date): Promise<number> {
  const { flags, env } = await import("@/lib/env");
  if (!flags.realStorage) return 0;
  const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });

  const cutoff = new Date(now.getTime() - 7 * 86_400_000);
  const candidates: string[] = [];
  // One page per prefix per hourly run; the next run continues. Both the
  // uploads/ originals and the thumbnails/ derivatives are covered (asset
  // deletion removes only the main key, so orphaned thumbs accumulate too).
  for (const prefix of ["uploads/", "thumbnails/"]) {
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: env.S3_BUCKET!, Prefix: prefix, MaxKeys: 200 }),
    );
    for (const obj of listed.Contents ?? []) {
      if (!obj.Key || !obj.LastModified || obj.LastModified >= cutoff) continue;
      candidates.push(obj.Key);
      if (candidates.length >= 100) break;
    }
    if (candidates.length >= 100) break;
  }
  if (candidates.length === 0) return 0;

  // Reference check: a key is garbage only if no asset points at it as url
  // or thumbUrl (matched by suffix — works for every public-URL shape).
  const orphans: string[] = [];
  for (const key of candidates) {
    const ref = await db.mediaAsset.findFirst({
      where: { OR: [{ url: { endsWith: key } }, { thumbUrl: { endsWith: key } }] },
      select: { id: true },
    });
    if (!ref) orphans.push(key);
  }
  if (orphans.length === 0) return 0;

  const res = await s3.send(
    new DeleteObjectsCommand({
      Bucket: env.S3_BUCKET!,
      Delete: { Objects: orphans.map((Key) => ({ Key })) },
    }),
  );
  const deleted = (res.Deleted ?? []).length;
  if (deleted > 0) logger.info({ keys: orphans.slice(0, 10), deleted }, "janitor deleted orphan uploads");
  return deleted;
}
