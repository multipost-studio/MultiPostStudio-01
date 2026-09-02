import { db } from "@/lib/db";
import { seededRandom } from "@/lib/utils";
import { logActivity, notifyWorkspace } from "@/lib/events";
import { dispatchWebhook } from "@/lib/adapters/webhooks";
import { logger } from "@/lib/logger";
import { runDueAutomations } from "@/lib/adapters/automations";

/**
 * Publish queue. Jobs live in the PublishJob table; `runDueJobs` is invoked
 * either by /api/cron/tick (polled from the client in dev, hit by a platform
 * cron in prod) or by the standalone worker loop (`runWorker`, entry point
 * scripts/worker.ts). Same code path either way.
 *
 * Publishing itself is still simulated — real platform API calls belong in the
 * per-platform block below where `publishedUrl`/`remoteId` are stamped.
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

export async function runDueJobs(now = new Date()) {
  const due = await db.publishJob.findMany({
    where: { status: "queued", runAt: { lte: now } },
    take: 25,
    orderBy: { runAt: "asc" },
  });

  let processed = 0;
  for (const job of due) {
    processed++;
    await db.publishJob.update({
      where: { id: job.id },
      data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } },
    });

    const post = await db.post.findUnique({
      where: { id: job.postId },
      include: { channels: { include: { channel: true } }, workspace: true },
    });
    if (!post) {
      await db.publishJob.update({ where: { id: job.id }, data: { status: "failed", lastError: "post missing" } });
      continue;
    }

    const roll = seededRandom(job.id + job.attempts);
    const failed = roll < FAIL_RATE;

    if (failed) {
      await db.$transaction([
        db.post.update({ where: { id: post.id }, data: { status: "failed" } }),
        db.postChannel.updateMany({
          where: { postId: post.id },
          data: { status: "failed", error: "Platform API rejected the request (simulated). Retry available." },
        }),
        db.publishJob.update({
          where: { id: job.id },
          data: { status: "failed", finishedAt: new Date(), lastError: "simulated platform failure" },
        }),
      ]);
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

    // Success: mark published, stamp URLs, seed initial metrics.
    const publishedAt = new Date();
    await db.$transaction([
      db.post.update({ where: { id: post.id }, data: { status: "published", publishedAt } }),
      ...post.channels.map((pc) =>
        db.postChannel.update({
          where: { id: pc.id },
          data: {
            status: "published",
            publishedUrl: `https://${pc.platform}.example/${post.workspace.slug}/${pc.id.slice(0, 8)}`,
            remoteId: pc.id.slice(0, 12),
            error: null,
          },
        }),
      ),
      db.publishJob.update({ where: { id: job.id }, data: { status: "done", finishedAt: publishedAt } }),
    ]);

    for (const pc of post.channels) {
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
      type: "publish_success",
      title: "Post published",
      body: `"${post.title ?? "Untitled post"}" went live on ${post.channels.length} channel${post.channels.length === 1 ? "" : "s"}.`,
      linkUrl: `/composer/${post.id}`,
    });
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
      const jobs = await runDueJobs();
      const autos = await runDueAutomations();
      if (jobs.processed || autos.ran) {
        logger.info({ processed: jobs.processed, automations: autos.ran }, "worker tick");
      }
    } catch (e) {
      logger.error({ err: e }, "worker tick failed");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  logger.info("publish worker stopped");
}
