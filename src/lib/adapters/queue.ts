import { db } from "@/lib/db";
import { seededRandom } from "@/lib/utils";
import { logActivity, notifyWorkspace } from "@/lib/events";
import { dispatchWebhook } from "@/lib/adapters/webhooks";
import { logger } from "@/lib/logger";
import { runDueAutomations } from "@/lib/adapters/automations";
import { canPublishReal, publishToPlatform, logPublishFailure } from "@/lib/adapters/publish";

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
      include: {
        channels: { include: { channel: true } },
        media: { include: { media: true }, orderBy: { order: "asc" } },
        workspace: true,
      },
    });
    if (!post) {
      await db.publishJob.update({ where: { id: job.id }, data: { status: "failed", lastError: "post missing" } });
      continue;
    }

    // Publish each channel. Channels whose account has real credentials hit the
    // real platform API; the rest use the simulated path (seeded fail rate +
    // seeded metrics) so the demo keeps working with zero config.
    const publishedAt = new Date();
    let anyPublished = false;
    let anyFailed = false;
    const stubChannels: string[] = [];

    for (const pc of post.channels) {
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
          const r = await publishToPlatform(account, pc.channel, pc.body, media, pc.contentType);
          await db.postChannel.update({
            where: { id: pc.id },
            data: { status: "published", publishedUrl: r.url, remoteId: r.remoteId, error: null },
          });
          await db.socialAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } });
          anyPublished = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logPublishFailure(account.platform, e);
          await db.postChannel.update({
            where: { id: pc.id },
            data: { status: "failed", error: msg.slice(0, 500) },
          });
          anyFailed = true;
        }
        continue;
      }

      // Simulated path.
      const roll = seededRandom(pc.id + job.attempts);
      if (roll < FAIL_RATE) {
        await db.postChannel.update({
          where: { id: pc.id },
          data: { status: "failed", error: "Platform API rejected the request (simulated). Retry available." },
        });
        anyFailed = true;
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
      }
    }

    await db.post.update({
      where: { id: post.id },
      data: {
        status: anyPublished ? "published" : "failed",
        publishedAt: anyPublished ? publishedAt : null,
      },
    });
    await db.publishJob.update({
      where: { id: job.id },
      data: {
        status: anyPublished ? "done" : "failed",
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
      type: "publish_success",
      title: anyFailed ? "Post partly published" : "Post published",
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
