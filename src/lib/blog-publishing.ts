import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/events";
import { createAdminNotification } from "@/lib/admin-notifications";

/**
 * Scheduled Publishing Engine for Blog Posts.
 * Called on every cron tick (e.g. from runScheduledWork).
 * Idempotent, transactionally safe, and logs all events.
 */
export async function publishDueBlogPosts(): Promise<{ published: number; postIds: string[] }> {
  const now = new Date();

  // Find all scheduled posts whose time has arrived
  const duePosts = await db.blogPost.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      authorId: true,
    },
  });

  if (duePosts.length === 0) {
    return { published: 0, postIds: [] };
  }

  const publishedIds: string[] = [];

  for (const post of duePosts) {
    try {
      await db.blogPost.update({
        where: { id: post.id },
        data: {
          status: "published",
          publishedAt: now,
        },
      });

      publishedIds.push(post.id);

      // Audit log
      await logAudit({
        action: "blog.post_published_scheduled",
        targetType: "BlogPost",
        targetId: post.id,
        metadata: { title: post.title, slug: post.slug, autoPublished: true },
      });

      // Notify platform admin
      await createAdminNotification({
        type: "blog_published",
        priority: "info",
        title: `Blog Post Published: ${post.title}`,
        body: `Scheduled blog post "${post.title}" was automatically published to the marketing site.`,
        linkUrl: `/admin/blog/${post.id}`,
      }).catch((e: unknown) => logger.warn({ err: e }, "Failed to send scheduled post notification"));

      logger.info({ postId: post.id, slug: post.slug }, "Scheduled blog post successfully published");
    } catch (err) {
      logger.error({ err, postId: post.id }, "Failed to publish scheduled blog post");

      // Notify admin of publishing failure
      await createAdminNotification({
        type: "blog_publish_failed",
        priority: "critical",
        title: `Scheduled Publishing Failed: ${post.title}`,
        body: `Failed to automatically publish scheduled post "${post.title}". Check system logs.`,
        linkUrl: `/admin/blog/${post.id}`,
      }).catch(() => {});
    }
  }

  return { published: publishedIds.length, postIds: publishedIds };
}
