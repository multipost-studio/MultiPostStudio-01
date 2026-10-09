import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createForWorkspace } from "./service";
import { buildPublishNotification } from "./publish";
import { platformName } from "./types";

/**
 * Tell the workspace how a publish run ended: ONE notification per post, however many channels it had.
 * Channel results are read back from the database (the truth after retries, where some channels published
 * on an earlier attempt), never from what this run happened to touch.
 *
 * Repeated "reconnect this account" failures for the same platform (a dead token fails every queued post)
 * fold into a single entry per hour instead of one per post.
 */
export async function notifyPublishResult(args: { jobId: string; post: { id: string; title: string | null; workspaceId: string } }): Promise<void> {
  try {
    const channels = await db.postChannel.findMany({
      where: { postId: args.post.id, status: { in: ["published", "failed"] } },
      select: { platform: true, status: true, error: true },
    });
    if (channels.length === 0) return;
    const n = buildPublishNotification({ postId: args.post.id, postTitle: args.post.title, channels });
    const reconnect = n.metadata.failureKind === "reconnect" && n.platform !== null;
    await createForWorkspace(args.post.workspaceId, {
      type: n.type,
      title: n.title,
      body: n.body,
      priority: n.priority,
      linkUrl: n.linkUrl,
      actionLabel: n.actionLabel,
      platform: n.platform,
      metadata: n.metadata,
      entityType: reconnect ? "publish_account" : "post",
      entityId: reconnect ? `${args.post.workspaceId}:${n.platform}` : args.post.id,
      // A job reaches its terminal state once; the key also makes a replayed run harmless.
      dedupeKey: `publish:${args.jobId}`,
      ...(reconnect
        ? {
            group: {
              windowMin: 60,
              merge: (count: number) => ({
                title: `${count} posts could not be published to ${platformName(n.platform!)}`,
                body: `The ${platformName(n.platform!)} connection needs attention. Reconnect it so your queued posts can go out.`,
                linkUrl: "/integrations",
                actionLabel: "Reconnect",
              }),
            },
          }
        : {}),
    });
  } catch (err) {
    // A notification problem must never turn a finished publish into a failed job.
    logger.warn({ err, postId: args.post.id }, "publish notification failed");
  }
}
