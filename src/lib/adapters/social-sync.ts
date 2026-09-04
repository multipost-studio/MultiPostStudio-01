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

/* ---------------- Meta (Facebook Page + Instagram) ---------------- */

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph ${path.split("?")[0]} ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

/** PostMetric for published Facebook + Instagram posts, from Graph insights. */
async function syncMetaPostMetrics(): Promise<number> {
  const accounts = await db.socialAccount.findMany({
    where: { platform: { in: ["facebook", "instagram"] }, status: "connected" },
    include: { channels: { select: { id: true } } },
  });
  let updated = 0;

  for (const acc of accounts) {
    const token = readToken(acc.accessToken);
    if (!token || !isRealToken(acc.accessToken)) continue;
    const chanIds = acc.channels.map((c) => c.id);
    if (chanIds.length === 0) continue;

    const pcs = await db.postChannel.findMany({
      where: {
        channelId: { in: chanIds },
        status: "published",
        remoteId: { not: null },
        post: { publishedAt: { gte: new Date(Date.now() - 60 * DAY) } },
      },
      select: { id: true, postId: true, remoteId: true },
    });

    for (const pc of pcs) {
      try {
        let m: {
          impressions: number;
          reach: number;
          likes: number;
          comments: number;
          shares: number;
          saves: number;
          clicks: number;
          videoViews: number;
        };

        if (acc.platform === "facebook") {
          const d = await graphGet<{
            insights?: { data: { name: string; values: { value: number }[] }[] };
            comments?: { summary?: { total_count?: number } };
            reactions?: { summary?: { total_count?: number } };
            shares?: { count?: number };
          }>(
            `${pc.remoteId}?fields=insights.metric(post_impressions,post_impressions_unique,post_clicks,post_video_views),` +
              `comments.summary(true),reactions.summary(true),shares&access_token=${token}`,
          );
          const ins = Object.fromEntries((d.insights?.data ?? []).map((x) => [x.name, x.values[0]?.value ?? 0]));
          m = {
            impressions: ins.post_impressions ?? 0,
            reach: ins.post_impressions_unique ?? 0,
            clicks: ins.post_clicks ?? 0,
            videoViews: ins.post_video_views ?? 0,
            likes: d.reactions?.summary?.total_count ?? 0,
            comments: d.comments?.summary?.total_count ?? 0,
            shares: d.shares?.count ?? 0,
            saves: 0,
          };
        } else {
          const [ins, base] = await Promise.all([
            graphGet<{ data: { name: string; values: { value: number }[] }[] }>(
              `${pc.remoteId}/insights?metric=impressions,reach,saved,likes,comments,shares&access_token=${token}`,
            ).catch(() => ({ data: [] })),
            graphGet<{ like_count?: number; comments_count?: number }>(
              `${pc.remoteId}?fields=like_count,comments_count&access_token=${token}`,
            ),
          ]);
          const v = Object.fromEntries((ins.data ?? []).map((x) => [x.name, x.values[0]?.value ?? 0]));
          m = {
            impressions: v.impressions ?? 0,
            reach: v.reach ?? 0,
            saves: v.saved ?? 0,
            shares: v.shares ?? 0,
            likes: v.likes ?? base.like_count ?? 0,
            comments: v.comments ?? base.comments_count ?? 0,
            clicks: 0,
            videoViews: 0,
          };
        }

        const engagement = m.likes + m.comments + m.shares + m.saves;
        await db.postMetric.deleteMany({ where: { postChannelId: pc.id } });
        await db.postMetric.create({
          data: {
            postId: pc.postId,
            postChannelId: pc.id,
            ...m,
            engagementRate: m.impressions > 0 ? (engagement / m.impressions) * 100 : 0,
          },
        });
        updated++;
      } catch (e) {
        logger.warn({ err: e, pc: pc.id }, "meta post-metric fetch failed");
      }
    }
  }
  return updated;
}

/** Facebook + Instagram comments into the Inbox. */
async function syncMetaInbox(): Promise<number> {
  const accounts = await db.socialAccount.findMany({
    where: { platform: { in: ["facebook", "instagram"] }, status: "connected" },
    include: { channels: { select: { id: true, workspaceId: true } } },
  });
  let created = 0;

  for (const acc of accounts) {
    const token = readToken(acc.accessToken);
    if (!token || !isRealToken(acc.accessToken)) continue;
    const channel = acc.channels[0];
    if (!channel) continue;
    const chanIds = acc.channels.map((c) => c.id);

    const pcs = await db.postChannel.findMany({
      where: {
        channelId: { in: chanIds },
        status: "published",
        remoteId: { not: null },
        post: { publishedAt: { gte: new Date(Date.now() - 14 * DAY) } },
      },
      select: { remoteId: true },
      take: 50,
    });

    for (const pc of pcs) {
      try {
        const fields =
          acc.platform === "facebook"
            ? "id,message,from{name,id},created_time"
            : "id,text,username,timestamp";
        const d = await graphGet<{ data: { id: string; message?: string; text?: string; from?: { name?: string }; username?: string; created_time?: string; timestamp?: string }[] }>(
          `${pc.remoteId}/comments?fields=${fields}&limit=50&access_token=${token}`,
        );
        for (const c of d.data ?? []) {
          const body = (c.message ?? c.text ?? "").slice(0, 4000);
          if (!body) continue;
          const externalId = `${acc.platform}:comment:${c.id}`;
          const exists = await db.conversation.findFirst({
            where: { workspaceId: channel.workspaceId, externalId },
            select: { id: true },
          });
          if (exists) continue;
          const author = c.from?.name ?? c.username ?? "Someone";
          const conv = await db.conversation.create({
            data: {
              workspaceId: channel.workspaceId,
              channelId: channel.id,
              platform: acc.platform,
              type: "comment",
              externalId,
              authorName: author,
              authorHandle: c.username ? `@${c.username}` : author,
              preview: body.slice(0, 200),
              status: "open",
              sentiment: detectSentiment(body),
              priority: 1,
              lastMessageAt: new Date(c.created_time ?? c.timestamp ?? Date.now()),
            },
          });
          await db.message.create({
            data: { conversationId: conv.id, direction: "inbound", authorName: author, body },
          });
          created++;
        }
      } catch (e) {
        logger.warn({ err: e, pc: pc.remoteId }, "meta comments fetch failed");
      }
    }
  }
  return created;
}

/* ---------------- Threads ---------------- */

const THREADS = "https://graph.threads.net/v1.0";

async function threadsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${THREADS}/${path}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Threads ${path.split("?")[0]} ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

/** PostMetric for published Threads posts, from Threads insights. */
async function syncThreadsPostMetrics(): Promise<number> {
  const accounts = await db.socialAccount.findMany({
    where: { platform: "threads", status: "connected" },
    include: { channels: { select: { id: true } } },
  });
  let updated = 0;

  for (const acc of accounts) {
    const token = readToken(acc.accessToken);
    if (!token || !isRealToken(acc.accessToken)) continue;
    const chanIds = acc.channels.map((c) => c.id);
    if (chanIds.length === 0) continue;

    const pcs = await db.postChannel.findMany({
      where: {
        channelId: { in: chanIds },
        status: "published",
        remoteId: { not: null },
        post: { publishedAt: { gte: new Date(Date.now() - 60 * DAY) } },
      },
      select: { id: true, postId: true, remoteId: true },
    });

    for (const pc of pcs) {
      try {
        const d = await threadsGet<{
          data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[];
        }>(
          `${pc.remoteId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${token}`,
        );
        const v = Object.fromEntries(
          (d.data ?? []).map((x) => [x.name, x.total_value?.value ?? x.values?.[0]?.value ?? 0]),
        );
        const likes = v.likes ?? 0;
        const comments = v.replies ?? 0;
        const shares = (v.reposts ?? 0) + (v.quotes ?? 0);
        const impressions = v.views ?? 0;
        await db.postMetric.deleteMany({ where: { postChannelId: pc.id } });
        await db.postMetric.create({
          data: {
            postId: pc.postId,
            postChannelId: pc.id,
            impressions,
            reach: 0,
            likes,
            comments,
            shares,
            saves: 0,
            clicks: 0,
            videoViews: 0,
            engagementRate: impressions > 0 ? ((likes + comments + shares) / impressions) * 100 : 0,
          },
        });
        updated++;
      } catch (e) {
        logger.warn({ err: e, pc: pc.id }, "threads post-metric fetch failed");
      }
    }
  }
  return updated;
}

/** Threads replies into the Inbox. */
async function syncThreadsInbox(): Promise<number> {
  const accounts = await db.socialAccount.findMany({
    where: { platform: "threads", status: "connected" },
    include: { channels: { select: { id: true, workspaceId: true } } },
  });
  let created = 0;

  for (const acc of accounts) {
    const token = readToken(acc.accessToken);
    if (!token || !isRealToken(acc.accessToken)) continue;
    const channel = acc.channels[0];
    if (!channel) continue;
    const chanIds = acc.channels.map((c) => c.id);

    const pcs = await db.postChannel.findMany({
      where: {
        channelId: { in: chanIds },
        status: "published",
        remoteId: { not: null },
        post: { publishedAt: { gte: new Date(Date.now() - 14 * DAY) } },
      },
      select: { remoteId: true },
      take: 50,
    });

    for (const pc of pcs) {
      try {
        const d = await threadsGet<{
          data?: { id: string; text?: string; username?: string; timestamp?: string }[];
        }>(`${pc.remoteId}/replies?fields=id,text,username,timestamp&access_token=${token}`);
        for (const c of d.data ?? []) {
          const body = (c.text ?? "").slice(0, 4000);
          if (!body) continue;
          const externalId = `threads:reply:${c.id}`;
          const exists = await db.conversation.findFirst({
            where: { workspaceId: channel.workspaceId, externalId },
            select: { id: true },
          });
          if (exists) continue;
          const author = c.username ?? "Someone";
          const conv = await db.conversation.create({
            data: {
              workspaceId: channel.workspaceId,
              channelId: channel.id,
              platform: "threads",
              type: "reply",
              externalId,
              authorName: author,
              authorHandle: c.username ? `@${c.username}` : author,
              preview: body.slice(0, 200),
              status: "open",
              sentiment: detectSentiment(body),
              priority: 1,
              lastMessageAt: new Date(c.timestamp ?? Date.now()),
            },
          });
          await db.message.create({
            data: { conversationId: conv.id, direction: "inbound", authorName: author, body },
          });
          created++;
        }
      } catch (e) {
        logger.warn({ err: e, pc: pc.remoteId }, "threads replies fetch failed");
      }
    }
  }
  return created;
}

export async function runSocialSync(): Promise<{ metrics: number; inbox: number }> {
  const results = await Promise.all([
    syncBlueskyPostMetrics().catch((e) => (logger.warn({ err: e }, "bsky metrics sync failed"), 0)),
    syncBlueskyInbox().catch((e) => (logger.warn({ err: e }, "bsky inbox sync failed"), 0)),
    syncMetaPostMetrics().catch((e) => (logger.warn({ err: e }, "meta metrics sync failed"), 0)),
    syncMetaInbox().catch((e) => (logger.warn({ err: e }, "meta inbox sync failed"), 0)),
    syncThreadsPostMetrics().catch((e) => (logger.warn({ err: e }, "threads metrics sync failed"), 0)),
    syncThreadsInbox().catch((e) => (logger.warn({ err: e }, "threads inbox sync failed"), 0)),
  ]);
  return {
    metrics: results[0] + results[2] + results[4],
    inbox: results[1] + results[3] + results[5],
  };
}
