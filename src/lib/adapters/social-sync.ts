import { db } from "@/lib/db";
import { readToken, isRealToken } from "@/lib/social/crypto";
import { parseJson } from "@/lib/utils";
import { blueskyGetPostStats, blueskyListNotifications } from "@/lib/social/bluesky";
import { detectSentiment } from "@/lib/adapters/ai";
import { logger } from "@/lib/logger";

/**
 * Pulls real engagement back from connected platforms:
 *   - post stats  -> PostMetric rows (feeds analytics + dashboard)
 *   - replies/mentions -> Conversation + Message rows (feeds Inbox / Comments)
 *
 * Bluesky is wired today (no OAuth needed). Other platforms get the same
 * treatment once their OAuth credentials are configured.
 */

const DAY = 86_400_000;

/** Refresh PostMetric for every published Bluesky channel post. */
async function syncBlueskyPostMetrics(): Promise<number> {
  const accounts = await db.socialAccount.findMany({
    where: { platform: "bluesky", status: "connected" },
  });
  let updated = 0;

  for (const acc of accounts) {
    const jwt = readToken(acc.accessToken);
    if (!jwt || !isRealToken(acc.accessToken)) continue;
    const meta = parseJson<{ pds?: string }>(acc.metadata, {});

    // Published channel posts on this account with a real AT-URI remoteId,
    // published in the last 60 days.
    const channels = await db.socialChannel.findMany({ where: { socialAccountId: acc.id }, select: { id: true } });
    const chanIds = channels.map((c) => c.id);
    if (chanIds.length === 0) continue;

    const pcs = await db.postChannel.findMany({
      where: {
        channelId: { in: chanIds },
        status: "published",
        remoteId: { startsWith: "at://" },
        post: { publishedAt: { gte: new Date(Date.now() - 60 * DAY) } },
      },
      select: { id: true, postId: true, remoteId: true },
    });
    if (pcs.length === 0) continue;

    let stats: Awaited<ReturnType<typeof blueskyGetPostStats>>;
    try {
      stats = await blueskyGetPostStats(pcs.map((p) => p.remoteId!), jwt, meta.pds);
    } catch (e) {
      logger.warn({ err: e, accountId: acc.id }, "bluesky post-stats fetch failed");
      continue;
    }

    for (const pc of pcs) {
      const s = stats[pc.remoteId!];
      if (!s) continue;
      // Bluesky exposes no impression/reach count — those stay 0 (honest).
      await db.postMetric.deleteMany({ where: { postChannelId: pc.id } });
      await db.postMetric.create({
        data: {
          postId: pc.postId,
          postChannelId: pc.id,
          impressions: 0,
          reach: 0,
          likes: s.likes,
          comments: s.replies,
          shares: s.reposts + s.quotes,
          saves: 0,
          clicks: 0,
          videoViews: 0,
          engagementRate: 0,
        },
      });
      updated++;
    }
  }
  return updated;
}

/** Pull Bluesky replies / mentions / quotes into the Inbox. */
async function syncBlueskyInbox(): Promise<number> {
  const accounts = await db.socialAccount.findMany({
    where: { platform: "bluesky", status: "connected" },
    include: { channels: { select: { id: true, workspaceId: true } } },
  });
  let created = 0;

  for (const acc of accounts) {
    const jwt = readToken(acc.accessToken);
    if (!jwt || !isRealToken(acc.accessToken)) continue;
    const channel = acc.channels[0];
    if (!channel) continue;
    const meta = parseJson<{ pds?: string; notifCursor?: string }>(acc.metadata, {});

    let page;
    try {
      page = await blueskyListNotifications(jwt, { limit: 50 }, meta.pds);
    } catch (e) {
      logger.warn({ err: e, accountId: acc.id }, "bluesky notifications fetch failed");
      continue;
    }

    const relevant = page.notifications.filter(
      (n) => (n.reason === "reply" || n.reason === "mention" || n.reason === "quote") && n.record?.text,
    );

    for (const n of relevant) {
      const exists = await db.conversation.findFirst({
        where: { workspaceId: channel.workspaceId, externalId: n.uri },
        select: { id: true },
      });
      if (exists) continue;

      const text = (n.record.text ?? "").slice(0, 4000);
      const conv = await db.conversation.create({
        data: {
          workspaceId: channel.workspaceId,
          channelId: channel.id,
          platform: "bluesky",
          type: n.reason === "mention" ? "mention" : n.reason === "quote" ? "reply" : "reply",
          externalId: n.uri,
          authorName: n.author.displayName?.trim() || n.author.handle,
          authorHandle: `@${n.author.handle}`,
          authorAvatar: n.author.avatar ?? null,
          preview: text.slice(0, 200),
          status: "open",
          sentiment: detectSentiment(text),
          priority: n.reason === "mention" ? 2 : 1,
          lastMessageAt: new Date(n.indexedAt),
        },
      });
      await db.message.create({
        data: { conversationId: conv.id, direction: "inbound", authorName: n.author.handle, body: text },
      });
      created++;
    }

    // Advance the cursor so the next run only sees newer notifications.
    if (page.cursor && page.cursor !== meta.notifCursor) {
      await db.socialAccount.update({
        where: { id: acc.id },
        data: { metadata: JSON.stringify({ ...meta, notifCursor: page.cursor }) },
      });
    }
  }
  return created;
}

export async function runSocialSync(): Promise<{ metrics: number; inbox: number }> {
  const [metrics, inbox] = await Promise.all([
    syncBlueskyPostMetrics().catch((e) => {
      logger.warn({ err: e }, "post-metrics sync failed");
      return 0;
    }),
    syncBlueskyInbox().catch((e) => {
      logger.warn({ err: e }, "inbox sync failed");
      return 0;
    }),
  ]);
  return { metrics, inbox };
}
