import { db } from "@/lib/db";
import { isRealToken } from "@/lib/social/crypto";
import { refreshIfNeeded } from "@/lib/social/oauth";
import { parseJson, mapConcurrent } from "@/lib/utils";
import { blueskyGetPostStats, blueskyListNotifications } from "@/lib/social/bluesky";
import { runWithBluesky } from "@/lib/social/bluesky-session";
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

/**
 * Adaptive sync window: most engagement happens in the first 14 days.
 * Deep historical sync (up to 60 days) runs every 6 hours to conserve bandwidth.
 */
function getSyncWindowDays(): number {
  const hour = new Date().getUTCHours();
  return hour % 6 === 0 ? 60 : 14;
}

type MetricPayload = {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  videoViews: number;
  engagementRate: number;
};

type PostMetricItem = {
  postId: string;
  postChannelId: string;
  metric: MetricPayload;
};

/**
 * Batched, idempotent metric updates: pre-fetches existing PostMetric rows in a
 * single DB roundtrip and applies changes, eliminating N+1 database queries.
 */
async function batchUpsertPostMetrics(items: PostMetricItem[]): Promise<number> {
  if (items.length === 0) return 0;

  const existingMetrics = await db.postMetric.findMany({
    where: { postChannelId: { in: items.map((it) => it.postChannelId) } },
    select: {
      id: true,
      postChannelId: true,
      impressions: true,
      reach: true,
      likes: true,
      comments: true,
      shares: true,
      saves: true,
      clicks: true,
      videoViews: true,
      engagementRate: true,
    },
  });
  const existingMap = new Map(existingMetrics.map((em) => [em.postChannelId, em]));

  let updated = 0;
  for (const item of items) {
    const existing = existingMap.get(item.postChannelId);
    const m = item.metric;
    if (existing) {
      const hasChanged =
        existing.impressions !== m.impressions ||
        existing.reach !== m.reach ||
        existing.likes !== m.likes ||
        existing.comments !== m.comments ||
        existing.shares !== m.shares ||
        existing.saves !== m.saves ||
        existing.clicks !== m.clicks ||
        existing.videoViews !== m.videoViews ||
        Math.abs(existing.engagementRate - m.engagementRate) > 0.01;

      if (hasChanged) {
        await db.postMetric.update({
          where: { id: existing.id },
          data: { ...m, capturedAt: new Date() },
        });
        updated++;
      }
    } else {
      await db.postMetric.create({
        data: {
          postId: item.postId,
          postChannelId: item.postChannelId,
          ...m,
        },
      });
      updated++;
    }
  }
  return updated;
}

/**
 * Idempotent metric update: updates only if values changed, avoiding
 * deleteMany + create thrashing and unnecessary database writes.
 */
async function upsertPostMetric(
  postId: string,
  postChannelId: string,
  m: MetricPayload,
): Promise<boolean> {
  const count = await batchUpsertPostMetrics([{ postId, postChannelId, metric: m }]);
  return count > 0;
}

/** Refresh PostMetric for every published Bluesky channel post. */
async function syncBlueskyPostMetrics(): Promise<number> {
  const accounts = await db.socialAccount.findMany({
    where: { platform: "bluesky", status: "connected" },
  });
  let updated = 0;
  const windowDays = getSyncWindowDays();

  for (const acc of accounts) {
    if (!isRealToken(acc.accessToken)) continue;

    // Published channel posts on this account with a real AT-URI remoteId.
    const channels = await db.socialChannel.findMany({ where: { socialAccountId: acc.id }, select: { id: true } });
    const chanIds = channels.map((c) => c.id);
    if (chanIds.length === 0) continue;

    const pcs = await db.postChannel.findMany({
      where: {
        channelId: { in: chanIds },
        status: "published",
        remoteId: { startsWith: "at://" },
        post: { publishedAt: { gte: new Date(Date.now() - windowDays * DAY) } },
      },
      select: { id: true, postId: true, remoteId: true },
    });
    if (pcs.length === 0) continue;

    let stats: Awaited<ReturnType<typeof blueskyGetPostStats>>;
    try {
      stats = await runWithBluesky(acc, (jwt, pds) =>
        blueskyGetPostStats(pcs.map((p) => p.remoteId!), jwt, pds),
      );
    } catch (e) {
      logger.warn({ err: e, accountId: acc.id }, "bluesky post-stats fetch failed");
      continue;
    }

    const items: PostMetricItem[] = [];
    for (const pc of pcs) {
      const s = stats[pc.remoteId!];
      if (!s) continue;
      // Bluesky exposes no impression/reach count — those stay 0 (honest).
      items.push({
        postId: pc.postId,
        postChannelId: pc.id,
        metric: {
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
    }
    updated += await batchUpsertPostMetrics(items);
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
    if (!isRealToken(acc.accessToken)) continue;
    const channel = acc.channels[0];
    if (!channel) continue;
    const meta = parseJson<{ pds?: string; notifCursor?: string }>(acc.metadata, {});

    let page;
    try {
      page = await runWithBluesky(acc, (jwt, pds) => blueskyListNotifications(jwt, { limit: 50 }, pds));
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
    // refreshIfNeeded, not readToken: expired OAuth must rotate (or flip the
    // account to expired) instead of silently skipping sync and letting
    // analytics go stale with only a log line.
    const token = await refreshIfNeeded(acc.id);
    if (!token || !isRealToken(acc.accessToken)) continue;
    const chanIds = acc.channels.map((c) => c.id);
    if (chanIds.length === 0) continue;

    const windowDays = getSyncWindowDays();
    const pcs = await db.postChannel.findMany({
      where: {
        channelId: { in: chanIds },
        status: "published",
        remoteId: { not: null },
        post: { publishedAt: { gte: new Date(Date.now() - windowDays * DAY) } },
      },
      select: { id: true, postId: true, remoteId: true },
    });
    if (pcs.length === 0) continue;

    // Fetch metrics concurrently (bounded at 5) to avoid consecutive HTTP waterfalls in Sentry
    const items = await mapConcurrent(pcs, 5, async (pc) => {
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
        return {
          postId: pc.postId,
          postChannelId: pc.id,
          metric: {
            ...m,
            engagementRate: m.impressions > 0 ? (engagement / m.impressions) * 100 : 0,
          },
        };
      } catch (e) {
        logger.warn({ err: e, pc: pc.id }, "meta post-metric fetch failed");
        return null;
      }
    });

    const validItems = items.filter((it): it is NonNullable<typeof it> => it !== null);
    updated += await batchUpsertPostMetrics(validItems);
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
    // refreshIfNeeded, not readToken: expired OAuth must rotate (or flip the
    // account to expired) instead of silently skipping sync and letting
    // analytics go stale with only a log line.
    const token = await refreshIfNeeded(acc.id);
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
    if (pcs.length === 0) continue;

    const fields =
      acc.platform === "facebook"
        ? "id,message,from{name,id},created_time"
        : "id,text,username,timestamp";

    // Fetch comments concurrently (bounded at 5)
    const commentBatches = await mapConcurrent(pcs, 5, async (pc) => {
      try {
        const d = await graphGet<{
          data?: {
            id: string;
            message?: string;
            text?: string;
            from?: { name?: string };
            username?: string;
            created_time?: string;
            timestamp?: string;
          }[];
        }>(`${pc.remoteId}/comments?fields=${fields}&limit=50&access_token=${token}`);
        return d.data ?? [];
      } catch (e) {
        logger.warn({ err: e, pc: pc.remoteId }, "meta comments fetch failed");
        return [];
      }
    });

    for (const c of commentBatches.flat()) {
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
    // refreshIfNeeded, not readToken: expired OAuth must rotate (or flip the
    // account to expired) instead of silently skipping sync and letting
    // analytics go stale with only a log line.
    const token = await refreshIfNeeded(acc.id);
    if (!token || !isRealToken(acc.accessToken)) continue;
    const chanIds = acc.channels.map((c) => c.id);
    if (chanIds.length === 0) continue;

    const windowDays = getSyncWindowDays();
    const pcs = await db.postChannel.findMany({
      where: {
        channelId: { in: chanIds },
        status: "published",
        remoteId: { not: null },
        post: { publishedAt: { gte: new Date(Date.now() - windowDays * DAY) } },
      },
      select: { id: true, postId: true, remoteId: true },
    });
    if (pcs.length === 0) continue;

    // Fetch insights concurrently (bounded at 5) to avoid consecutive HTTP waterfalls in Sentry
    const items = await mapConcurrent(pcs, 5, async (pc) => {
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
        return {
          postId: pc.postId,
          postChannelId: pc.id,
          metric: {
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
        };
      } catch (e) {
        logger.warn({ err: e, pc: pc.id }, "threads post-metric fetch failed");
        return null;
      }
    });

    const validItems = items.filter((it): it is NonNullable<typeof it> => it !== null);
    updated += await batchUpsertPostMetrics(validItems);
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
    // refreshIfNeeded, not readToken: expired OAuth must rotate (or flip the
    // account to expired) instead of silently skipping sync and letting
    // analytics go stale with only a log line.
    const token = await refreshIfNeeded(acc.id);
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
    if (pcs.length === 0) continue;

    // Fetch replies concurrently (bounded at 5)
    const repliesBatches = await mapConcurrent(pcs, 5, async (pc) => {
      try {
        const d = await threadsGet<{
          data?: { id: string; text?: string; username?: string; timestamp?: string }[];
        }>(`${pc.remoteId}/replies?fields=id,text,username,timestamp&access_token=${token}`);
        return d.data ?? [];
      } catch (e) {
        logger.warn({ err: e, pc: pc.remoteId }, "threads replies fetch failed");
        return [];
      }
    });

    for (const c of repliesBatches.flat()) {
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
  }
  return created;
}

/* ---------------- YouTube ---------------- */

const YT = "https://www.googleapis.com/youtube/v3";

async function ytGet<T>(path: string): Promise<T> {
  const res = await fetch(`${YT}/${path}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube ${path.split("?")[0]} ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

/** PostMetric for published YouTube videos, from video statistics. */
async function syncYouTubePostMetrics(): Promise<number> {
  const accounts = await db.socialAccount.findMany({
    where: { platform: "youtube", status: "connected" },
    include: { channels: { select: { id: true } } },
  });
  let updated = 0;

  for (const acc of accounts) {
    // refreshIfNeeded, not readToken: expired OAuth must rotate (or flip the
    // account to expired) instead of silently skipping sync and letting
    // analytics go stale with only a log line.
    const token = await refreshIfNeeded(acc.id);
    if (!token || !isRealToken(acc.accessToken)) continue;
    const chanIds = acc.channels.map((c) => c.id);
    if (chanIds.length === 0) continue;

    const windowDays = getSyncWindowDays();
    const pcs = await db.postChannel.findMany({
      where: {
        channelId: { in: chanIds },
        status: "published",
        remoteId: { not: null },
        post: { publishedAt: { gte: new Date(Date.now() - windowDays * DAY) } },
      },
      select: { id: true, postId: true, remoteId: true },
    });
    if (pcs.length === 0) continue;

    // videos.list takes up to 50 ids per call.
    for (let i = 0; i < pcs.length; i += 50) {
      const batch = pcs.slice(i, i + 50);
      let data;
      try {
        data = await ytGet<{ items?: { id: string; statistics?: Record<string, string> }[] }>(
          `videos?part=statistics&id=${batch.map((p) => p.remoteId).join(",")}&access_token=${token}`,
        );
      } catch (e) {
        logger.warn({ err: e, accountId: acc.id }, "youtube stats fetch failed");
        continue;
      }
      const byId = new Map((data.items ?? []).map((v) => [v.id, v.statistics ?? {}]));
      const batchItems: PostMetricItem[] = [];
      for (const pc of batch) {
        const s = byId.get(pc.remoteId!);
        if (!s) continue;
        const views = Number(s.viewCount ?? 0);
        const likes = Number(s.likeCount ?? 0);
        const comments = Number(s.commentCount ?? 0);
        batchItems.push({
          postId: pc.postId,
          postChannelId: pc.id,
          metric: {
            impressions: views,
            reach: views,
            likes,
            comments,
            shares: 0,
            saves: 0,
            clicks: 0,
            videoViews: views,
            engagementRate: views > 0 ? ((likes + comments) / views) * 100 : 0,
          },
        });
      }
      updated += await batchUpsertPostMetrics(batchItems);
    }
  }
  return updated;
}

/** YouTube video comments into the Inbox. */
async function syncYouTubeInbox(): Promise<number> {
  const accounts = await db.socialAccount.findMany({
    where: { platform: "youtube", status: "connected" },
    include: { channels: { select: { id: true, workspaceId: true } } },
  });
  let created = 0;

  for (const acc of accounts) {
    // refreshIfNeeded, not readToken: expired OAuth must rotate (or flip the
    // account to expired) instead of silently skipping sync and letting
    // analytics go stale with only a log line.
    const token = await refreshIfNeeded(acc.id);
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
    if (pcs.length === 0) continue;

    // Fetch comments concurrently (bounded at 5)
    const threadBatches = await mapConcurrent(pcs, 5, async (pc) => {
      try {
        const d = await ytGet<{
          items?: {
            snippet?: {
              topLevelComment?: {
                id?: string;
                snippet?: {
                  textDisplay?: string;
                  authorDisplayName?: string;
                  authorProfileImageUrl?: string;
                  publishedAt?: string;
                };
              };
            };
          }[];
        }>(
          `commentThreads?part=snippet&videoId=${pc.remoteId}&maxResults=50&order=time&access_token=${token}`,
        );
        return d.items ?? [];
      } catch (e) {
        logger.warn({ err: e, pc: pc.remoteId }, "youtube comments fetch failed");
        return [];
      }
    });

    for (const th of threadBatches.flat()) {
      const c = th.snippet?.topLevelComment;
      const cs = c?.snippet;
      const bodyText = (cs?.textDisplay ?? "").replace(/<[^>]+>/g, "").slice(0, 4000);
      if (!c?.id || !bodyText) continue;
      const externalId = `youtube:comment:${c.id}`;
      const exists = await db.conversation.findFirst({
        where: { workspaceId: channel.workspaceId, externalId },
        select: { id: true },
      });
      if (exists) continue;
      const author = cs?.authorDisplayName ?? "Someone";
      const conv = await db.conversation.create({
        data: {
          workspaceId: channel.workspaceId,
          channelId: channel.id,
          platform: "youtube",
          type: "comment",
          externalId,
          authorName: author,
          authorHandle: author,
          authorAvatar: cs?.authorProfileImageUrl ?? null,
          preview: bodyText.slice(0, 200),
          status: "open",
          sentiment: detectSentiment(bodyText),
          priority: 1,
          lastMessageAt: new Date(cs?.publishedAt ?? Date.now()),
        },
      });
      await db.message.create({
        data: { conversationId: conv.id, direction: "inbound", authorName: author, body: bodyText },
      });
      created++;
    }
  }
  return created;
}

let lastMetricsSyncTime = 0;
let lastInboxSyncTime = 0;
let cachedMetricsCount = 0;
let cachedInboxCount = 0;

const METRICS_SYNC_MIN_INTERVAL = 10 * 60 * 1000; // 10 minutes
const INBOX_SYNC_MIN_INTERVAL = 90 * 1000;         // 90 seconds

export async function runSocialSync(opts: { force?: boolean } = {}): Promise<{ metrics: number; inbox: number }> {
  const now = Date.now();

  let shouldSyncMetrics = opts.force ?? false;
  let shouldSyncInbox = opts.force ?? false;

  // Persist stamps in systemSetting so serverless cold starts (Vercel) do not reset
  // intervals to 0 and re-execute heavy platform syncs on every single tick.
  if (!shouldSyncMetrics) {
    const stamp = await db.systemSetting
      .findUnique({ where: { key: "social_sync_metrics_last_run" }, select: { value: true } })
      .catch(() => null);
    const last = stamp ? Date.parse(JSON.parse(stamp.value) as string) : lastMetricsSyncTime;
    shouldSyncMetrics = !Number.isFinite(last) || now - last >= METRICS_SYNC_MIN_INTERVAL;
  }

  if (!shouldSyncInbox) {
    const stamp = await db.systemSetting
      .findUnique({ where: { key: "social_sync_inbox_last_run" }, select: { value: true } })
      .catch(() => null);
    const last = stamp ? Date.parse(JSON.parse(stamp.value) as string) : lastInboxSyncTime;
    shouldSyncInbox = !Number.isFinite(last) || now - last >= INBOX_SYNC_MIN_INTERVAL;
  }

  let metrics = cachedMetricsCount;
  let inbox = cachedInboxCount;

  if (shouldSyncMetrics) {
    lastMetricsSyncTime = now;
    await db.systemSetting
      .upsert({
        where: { key: "social_sync_metrics_last_run" },
        create: { key: "social_sync_metrics_last_run", value: JSON.stringify(new Date(now).toISOString()) },
        update: { value: JSON.stringify(new Date(now).toISOString()) },
      })
      .catch((err) => logger.warn({ err }, "social sync: metrics stamp failed"));

    const mResults = await Promise.all([
      syncBlueskyPostMetrics().catch((e) => (logger.warn({ err: e }, "bsky metrics sync failed"), 0)),
      syncMetaPostMetrics().catch((e) => (logger.warn({ err: e }, "meta metrics sync failed"), 0)),
      syncThreadsPostMetrics().catch((e) => (logger.warn({ err: e }, "threads metrics sync failed"), 0)),
      syncYouTubePostMetrics().catch((e) => (logger.warn({ err: e }, "youtube metrics sync failed"), 0)),
    ]);
    metrics = mResults[0] + mResults[1] + mResults[2] + mResults[3];
    cachedMetricsCount = metrics;
  }

  if (shouldSyncInbox) {
    lastInboxSyncTime = now;
    await db.systemSetting
      .upsert({
        where: { key: "social_sync_inbox_last_run" },
        create: { key: "social_sync_inbox_last_run", value: JSON.stringify(new Date(now).toISOString()) },
        update: { value: JSON.stringify(new Date(now).toISOString()) },
      })
      .catch((err) => logger.warn({ err }, "social sync: inbox stamp failed"));

    const iResults = await Promise.all([
      syncBlueskyInbox().catch((e) => (logger.warn({ err: e }, "bsky inbox sync failed"), 0)),
      syncMetaInbox().catch((e) => (logger.warn({ err: e }, "meta inbox sync failed"), 0)),
      syncThreadsInbox().catch((e) => (logger.warn({ err: e }, "threads inbox sync failed"), 0)),
      syncYouTubeInbox().catch((e) => (logger.warn({ err: e }, "youtube inbox sync failed"), 0)),
    ]);
    inbox = iResults[0] + iResults[1] + iResults[2] + iResults[3];
    cachedInboxCount = inbox;
  }

  return { metrics, inbox };
}
