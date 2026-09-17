import { db } from "@/lib/db";
import { seededRandom } from "@/lib/utils";
import { logActivity, notifyWorkspace } from "@/lib/events";
import { dispatchWebhook } from "@/lib/adapters/webhooks";
import { debumpUsage } from "@/lib/adapters/billing";
import { logger } from "@/lib/logger";
import { isProduction } from "@/lib/env";
import { canPublishReal, isRetryablePublishError, publishToPlatform, postFirstComment, logPublishFailure } from "@/lib/adapters/publish";
import { isDeadTokenError, markAccountExpired } from "@/lib/social/oauth";
import { notifyStreakMilestone } from "@/lib/streak-service";
import { applyUtm } from "@/lib/utm";

/**
 * Publish queue. Jobs live in the PublishJob table; `runDueJobs` is invoked
 * either by /api/cron/tick (polled from the client in dev, hit by a platform
 * cron in prod) or by the standalone worker loop (`runWorker`, entry point
 * scripts/worker.ts). Same code path either way.
 *
 * Channels backed by real OAuth credentials publish for real (see
 * adapters/publish.ts). Channels without them — the manual "handle entry"
 * connect path — are SIMULATED, and simulation is hard-disabled in production:
 * telling a paying customer a post went live, with a fabricated permalink and
 * invented engagement metrics, when nothing reached any platform, is worse
 * than failing. In production those channels fail with an honest error.
 */

export async function enqueuePublish(postId: string, runAt: Date) {
  const existing = await db.publishJob.findFirst({
    where: { postId, status: { in: ["queued", "running"] } },
  });
  if (existing) {
    return db.publishJob.update({ where: { id: existing.id }, data: { runAt } });
  }
  return db.publishJob.create({ data: { postId, runAt, status: "queued" } });
}

export async function cancelPublish(postId: string) {
  await db.publishJob.updateMany({
    where: { postId, status: { in: ["queued", "running"] } },
    data: { status: "canceled" },
  });
}

const FAIL_RATE = 0.06; // simulate occasional platform API failure

const MAX_JOB_ATTEMPTS = 5; // automatic retries for transient failures, then terminal
const LEASE_MS = 5 * 60_000; // a claim older than this is presumed crashed
const PAUSED_RECHECK_MS = 15 * 60_000; // re-check fully-paused posts later

/**
 * Crash recovery: jobs stuck in "running" past their lease (worker killed,
 * serverless timeout, OOM mid-publish) go back to queued instead of sitting
 * in limbo forever — previously a crash after claim was a silent
 * never-publish with no sweeper and no alert.
 */
export async function reapStaleJobs(now = new Date()): Promise<number> {
  const res = await db.publishJob.updateMany({
    where: { status: "running", leaseUntil: { lt: now } },
    data: { status: "queued", leaseUntil: null, lastError: "Worker lost mid-publish — requeued" },
  });
  if (res.count > 0) logger.warn({ count: res.count }, "reaped stale publish jobs");
  return res.count;
}

export async function runDueJobs(now = new Date(), opts?: { postId?: string }) {
  await reapStaleJobs(now);

  const due = await db.publishJob.findMany({
    where: {
      status: "queued",
      runAt: { lte: now },
      ...(opts?.postId ? { postId: opts.postId } : {}),
    },
    take: 25,
    orderBy: { runAt: "asc" },
  });

  let processed = 0;
  for (const job of due) {
    // Atomic claim: the `status: "queued"` guard makes this a compare-and-swap
    // in a single UPDATE, so only one runner can move a job to "running".
    // Without it the findMany above is a read-then-write race — the worker and
    // a cron tick (or two overlapping ticks) would both see the same queued
    // job and both publish it, duplicating the post on the real account.
    const claim = await db.publishJob.updateMany({
      where: { id: job.id, status: "queued" },
      data: { status: "running", startedAt: new Date(), leaseUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue; // another runner got there first
    processed++;

    const post = await db.post.findUnique({
      where: { id: job.postId },
      include: {
        channels: { include: { channel: true } },
        media: { include: { media: true }, orderBy: { order: "asc" } },
        workspace: true,
      },
    });
    if (!post) {
      await db.publishJob.update({ where: { id: job.id }, data: { status: "failed", leaseUntil: null, lastError: "post missing" } });
      continue;
    }

    // Publish each channel. Channels whose account has real credentials hit the
    // real platform API; the rest use the simulated path (seeded fail rate +
    // seeded metrics) so the demo keeps working with zero config.
    const publishedAt = new Date();
    let anyPublished = false;
    let anyFailed = false;
    let publishedCount = 0;
    let failedCount = 0;
    let skippedPaused = 0;
    let retryableFailed = false;
    const stubChannels: string[] = [];

    for (const pc of post.channels) {
      // Never publish a channel twice. Retrying a partially-failed post resets
      // the post and re-enqueues it, so without this guard the channels that
      // already went live would be posted again — duplicating them on the
      // customer's real audience.
      if (pc.status === "published") continue;

      // A paused queue is a promise not to publish. Previously this flag was
      // display-only: toggleChannelQueueAction wrote it, the queue page showed
      // it, but runDueJobs never read it — paused channels published anyway.
      if (pc.channel?.queuePaused) {
        skippedPaused++;
        continue;
      }

      const account = pc.channel
        ? await db.socialAccount.findUnique({ where: { id: pc.channel.socialAccountId } })
        : null;

      if (account && canPublishReal(account)) {
        try {
          const media = post.media.map((m) => ({
            url: m.media.url,
            mimeType: m.media.mimeType,
            kind: m.media.kind,
            altText: m.media.altText ?? "",
          }));
          // Tag links per channel, so each platform reports its own
          // utm_source. Done here rather than on save so the body the author
          // edits stays readable.
          const body = applyUtm(
            pc.body,
            { source: post.utmSource, medium: post.utmMedium, campaign: post.utmCampaign },
            account.platform,
          );
          const r = await publishToPlatform(
            account,
            pc.channel,
            body,
            media,
            pc.contentType,
            account.platform === "x"
              ? {
                  getRetryState: async () =>
                    (await db.postChannel.findUnique({ where: { id: pc.id }, select: { retryState: true } }))
                      ?.retryState ?? null,
                  setRetryState: async (s: string) => {
                    await db.postChannel.update({ where: { id: pc.id }, data: { retryState: s } });
                  },
                }
              : undefined,
          );
          await db.postChannel.update({
            where: { id: pc.id },
            data: { status: "published", publishedUrl: r.url, remoteId: r.remoteId, error: null, retryState: null },
          });
          await db.socialAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } });
          anyPublished = true;
          publishedCount++;

          // The post is live. A first comment that fails is a nuisance, not a
          // failed publish — never let it flip this channel to "failed" or
          // trigger a retry that would post the whole thing twice.
          if (post.firstComment?.trim()) {
            try {
              await postFirstComment(account, r.remoteId, post.firstComment);
            } catch (err) {
              const why = err instanceof Error ? err.message : String(err);
              logger.warn(
                { err, platform: account.platform, postId: post.id },
                "first comment failed — the post itself published",
              );
              await logActivity({
                workspaceId: post.workspaceId,
                verb: "published",
                entityType: "post",
                entityId: post.id,
                summary: `Published to ${account.platform}, but the first comment didn't post: ${why}`,
              });
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logPublishFailure(account.platform, e);
          // Dead tokens (revoked/expired, e.g. Meta #190) flip the account to
          // "expired" so the UI prompts a reconnect instead of failing every
          // tick while displaying "connected".
          if (isDeadTokenError(msg)) {
            await markAccountExpired(account.id).catch(() => {});
          }
          await db.postChannel.update({
            where: { id: pc.id },
            data: { status: "failed", error: msg.slice(0, 500) },
          });
          anyFailed = true;
          failedCount++;
          // Transient failures (rate limits, 5xx, network) are requeued with
          // backoff at the end of this job instead of forcing a manual retry.
          // Permanent ones (auth, validation) stay failed for the user to fix.
          if (isRetryablePublishError(msg)) retryableFailed = true;
        }
        continue;
      }

      // No real credentials for this channel. In production that's a hard,
      // honest failure — never a fabricated "published" with a fake permalink.
      if (isProduction) {
        await db.postChannel.update({
          where: { id: pc.id },
          data: {
            status: "failed",
            error:
              `${pc.platform} isn't connected with real credentials. ` +
              `Reconnect it from Integrations (OAuth) so posts can actually be published.`,
          },
        });
        anyFailed = true;
        failedCount++;
        continue;
      }

      // Simulated path — local/demo only (see the guard above).
      const roll = seededRandom(pc.id + job.attempts);
      if (roll < FAIL_RATE) {
        await db.postChannel.update({
          where: { id: pc.id },
          data: { status: "failed", error: "Platform API rejected the request (simulated). Retry available." },
        });
        anyFailed = true;
        failedCount++;
      } else {
        await db.postChannel.update({
          where: { id: pc.id },
          data: {
            status: "published",
            publishedUrl: `https://${pc.platform}.example/${post.workspace.slug}/${pc.id.slice(0, 8)}`,
            remoteId: pc.id.slice(0, 12),
            error: null,
          },
        });
        stubChannels.push(pc.id);
        anyPublished = true;
        publishedCount++;
      }
    }

    // Every actionable channel is paused: failing the post would be a lie and
    // publishing would break the pause promise — park the job and re-check.
    if (!anyPublished && !anyFailed && skippedPaused > 0) {
      await db.publishJob.update({
        where: { id: job.id },
        data: {
          status: "queued",
          leaseUntil: null,
          runAt: new Date(Date.now() + PAUSED_RECHECK_MS),
          lastError: "All channels paused — rechecking later",
        },
      });
      continue;
    }

    // Transient failure with attempts left: requeue with exponential backoff
    // (2/4/8/16/30 min) instead of demanding a manual retry for a blip.
    // Published channels stay published and are skipped next run; X threads
    // resume mid-thread via retryState. `job.attempts` is pre-claim (the
    // claim already incremented it), hence +1.
    const attemptsUsed = job.attempts + 1;
    if (retryableFailed && attemptsUsed < MAX_JOB_ATTEMPTS) {
      const backoffMin = Math.min(2 ** attemptsUsed, 30);
      await db.publishJob.update({
        where: { id: job.id },
        data: {
          status: "queued",
          leaseUntil: null,
          runAt: new Date(Date.now() + backoffMin * 60_000),
          lastError: `Transient failure — automatic retry ${attemptsUsed}/${MAX_JOB_ATTEMPTS} in ${backoffMin}m`,
        },
      });
      await db.post.update({ where: { id: post.id }, data: { status: "scheduled" } });
      continue;
    }

    await db.post.update({
      where: { id: post.id },
      data: {
        status: anyPublished ? "published" : "failed",
        publishedAt: anyPublished ? publishedAt : null,
      },
    });
    // The post leaves the schedule here (published or terminally failed), so
    // the scheduled_posts gauge steps down — otherwise the dashboard drifts
    // monotonically upward while enforcement counts live rows.
    await debumpUsage(post.workspace.orgId, "scheduled_posts");
    await db.publishJob.update({
      where: { id: job.id },
      data: {
        status: anyPublished ? "done" : "failed",
        leaseUntil: null,
        finishedAt: publishedAt,
        lastError: anyFailed ? "one or more channels failed" : null,
      },
    });

    if (!anyPublished) {
      await notifyWorkspace(post.workspaceId, {
        type: "publish_failed",
        title: "Publishing failed",
        body: `"${post.title ?? "Untitled post"}" could not be published. Open it to retry.`,
        linkUrl: `/composer/${post.id}`,
      });
      await dispatchWebhook(post.workspace.orgId, "post.failed", { postId: post.id });
      await logActivity({
        workspaceId: post.workspaceId,
        verb: "failed",
        entityType: "post",
        entityId: post.id,
        summary: `Publishing failed for "${post.title ?? "Untitled post"}"`,
      });
      continue;
    }

    // Seed simulated metrics only for stubbed channels (real platforms get
    // metrics from a real sync, which is a separate integration).
    // `stubChannels` is always empty in production — the guard above fails
    // credential-less channels outright — so no invented engagement numbers
    // can ever reach a real customer's analytics.
    for (const pcId of stubChannels) {
      const pc = post.channels.find((c) => c.id === pcId)!;
      const base = 400 + Math.floor(seededRandom(pc.id + "imp") * 6000);
      const engagement = Math.floor(base * (0.02 + seededRandom(pc.id + "eng") * 0.08));
      await db.postMetric.create({
        data: {
          postId: post.id,
          postChannelId: pc.id,
          impressions: base,
          reach: Math.floor(base * 0.82),
          likes: Math.floor(engagement * 0.7),
          comments: Math.floor(engagement * 0.12),
          shares: Math.floor(engagement * 0.08),
          saves: Math.floor(engagement * 0.1),
          clicks: Math.floor(base * 0.03),
          videoViews: pc.platform === "youtube" || pc.platform === "tiktok" ? Math.floor(base * 0.6) : 0,
          engagementRate: Number(((engagement / base) * 100).toFixed(2)),
        },
      });
    }

    await notifyWorkspace(post.workspaceId, {
      type: anyFailed ? "publish_failed" : "publish_success",
      title: anyFailed ? "Post partly published" : "Post published",
      body: anyFailed
        ? `"${post.title ?? "Untitled post"}" went live on ${publishedCount} channel${publishedCount === 1 ? "" : "s"}, but ${failedCount} failed. Open it to retry the rest.`
        : `"${post.title ?? "Untitled post"}" went live on ${publishedCount} channel${publishedCount === 1 ? "" : "s"}.`,
      linkUrl: `/composer/${post.id}`,
    });
    if (anyFailed) {
      await dispatchWebhook(post.workspace.orgId, "post.failed", { postId: post.id, partial: true });
    }
    // A publish can push the workspace onto a streak milestone. Uses the
    // author's timezone for day boundaries and swallows its own errors, so it
    // can never turn a successful publish into a failed job.
    if (!anyFailed || post.channels.some((c) => c.status === "published")) {
      const author = await db.user.findUnique({
        where: { id: post.authorId },
        select: { timezone: true },
      });
      await notifyStreakMilestone(post.workspaceId, author?.timezone || "UTC");
    }
    await dispatchWebhook(post.workspace.orgId, "post.published", { postId: post.id });
    await logActivity({
      workspaceId: post.workspaceId,
      actorId: post.authorId,
      verb: "published",
      entityType: "post",
      entityId: post.id,
      summary: `Published "${post.title ?? "Untitled post"}"`,
    });

    // Compare prediction vs actual (learning loop).
    const pred = await db.postPrediction.findUnique({ where: { postId: post.id } });
    if (pred) {
      const metrics = await db.postMetric.findMany({ where: { postId: post.id } });
      const avgRate =
        metrics.reduce((s, m) => s + m.engagementRate, 0) / Math.max(1, metrics.length);
      await db.postPrediction.update({
        where: { postId: post.id },
        data: { actualEngagementRate: Number(avgRate.toFixed(2)), comparedAt: new Date() },
      });
    }
  }

  return { processed };
}

/**
 * Long-running worker loop for production. Run as its own process:
 *   node --import tsx scripts/worker.ts
 * Polls the queue + automations on an interval until SIGINT/SIGTERM.
 */
export async function runWorker(intervalMs = 15_000) {
  let stop = false;
  const halt = () => {
    stop = true;
  };
  process.once("SIGINT", halt);
  process.once("SIGTERM", halt);

  logger.info({ intervalMs }, "publish worker started");
  while (!stop) {
    try {
      // Runs the SAME set of jobs as /api/cron/tick. Previously the worker did
      // only publishing + automations, so a worker-only deployment silently
      // lost social sync, metrics rollups and scheduled reports.
      const { runScheduledWork } = await import("@/lib/scheduled-work");
      const r = await runScheduledWork();
      if (r.processed || r.automations || r.reports.emails) {
        logger.info(
          { processed: r.processed, automations: r.automations, reports: r.reports.emails },
          "worker tick",
        );
      }
    } catch (e) {
      logger.error({ err: e }, "worker tick failed");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  logger.info("publish worker stopped");
}
