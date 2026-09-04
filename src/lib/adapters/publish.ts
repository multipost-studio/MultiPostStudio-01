import type { SocialAccount, SocialChannel } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/utils";
import { readToken, isRealToken, encryptToken, decryptToken } from "@/lib/social/crypto";
import { getProvider } from "@/lib/social/providers";
import { refreshIfNeeded } from "@/lib/social/oauth";
import { blueskyPost, blueskyRefresh, type BlueskyImage } from "@/lib/social/bluesky";

/**
 * Real per-platform publishing. `queue.ts` calls `publishToPlatform` for any
 * channel whose account has real credentials (`canPublishReal`); everything
 * else stays on the simulated path.
 *
 * Implemented for real today: bluesky (app-password), linkedin, facebook, x
 * (need their OAuth app credentials). instagram/tiktok/youtube/pinterest/
 * threads/gbp throw NotImplemented until their publish flow is wired.
 */

export type PublishResult = { remoteId: string; url: string };

/** Attachments for a channel publish, resolved from the post's MediaAssets. */
export type PublishMedia = { url: string; mimeType: string; kind: string; altText: string };

export class PublishNotImplemented extends Error {
  constructor(platform: string) {
    super(`Real publishing for ${platform} is not implemented yet`);
    this.name = "PublishNotImplemented";
  }
}

/** True when this account can actually hit a real platform API. */
export function canPublishReal(account: Pick<SocialAccount, "platform" | "accessToken">): boolean {
  if (account.platform === "bluesky") return isRealToken(account.accessToken);
  return !!getProvider(account.platform) && isRealToken(account.accessToken);
}

export async function publishToPlatform(
  account: SocialAccount,
  channel: SocialChannel,
  body: string,
  media: PublishMedia[] = [],
): Promise<PublishResult> {
  switch (account.platform) {
    case "bluesky":
      return publishBluesky(account, channel, body, media);
    case "linkedin":
      return publishLinkedIn(account, body);
    case "facebook":
      return publishFacebook(account, body, media);
    case "instagram":
      return publishInstagram(account, body, media);
    case "threads":
      return publishThreads(account, body, media);
    case "x":
      return publishX(account, body);
    default:
      throw new PublishNotImplemented(account.platform);
  }
}

/* ---------------- Bluesky ---------------- */

async function publishBluesky(
  account: SocialAccount,
  channel: SocialChannel,
  text: string,
  media: PublishMedia[] = [],
): Promise<PublishResult> {
  const meta = parseJson<{ did?: string; pds?: string }>(account.metadata, {});
  if (!meta.did) throw new Error("Bluesky account missing did — reconnect it");
  let accessJwt = readToken(account.accessToken);
  if (!accessJwt) throw new Error("Bluesky session missing");

  const handle = channel.handle.replace(/^@/, "");
  // Bluesky embeds up to 4 images. Video needs a separate flow — skipped for now.
  const images: BlueskyImage[] = media
    .filter((m) => m.kind === "image" || m.mimeType.startsWith("image/"))
    .slice(0, 4)
    .map((m) => ({ url: m.url, mimeType: m.mimeType, alt: m.altText }));

  const send = (jwt: string) =>
    blueskyPost({ pds: meta.pds, accessJwt: jwt, did: meta.did!, handle, text, images });

  try {
    const r = await send(accessJwt);
    return { remoteId: r.uri, url: r.url };
  } catch (e) {
    // Access JWT likely expired — refresh once and retry.
    if (!/\b401\b|ExpiredToken/.test(String(e)) || !account.refreshToken) throw e;
    const refreshJwt = decryptToken(account.refreshToken);
    const s = await blueskyRefresh(refreshJwt, meta.pds);
    await db.socialAccount.update({
      where: { id: account.id },
      data: { accessToken: encryptToken(s.accessJwt), refreshToken: encryptToken(s.refreshJwt), status: "connected" },
    });
    accessJwt = s.accessJwt;
    const r = await send(accessJwt);
    return { remoteId: r.uri, url: r.url };
  }
}

/* ---------------- LinkedIn ---------------- */

async function publishLinkedIn(account: SocialAccount, text: string): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("LinkedIn token unavailable — reconnect");
  const meta = parseJson<{ remoteId?: string }>(account.metadata, {});
  if (!meta.remoteId) throw new Error("LinkedIn account missing member id — reconnect");
  const author = `urn:li:person:${meta.remoteId}`;

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const id = res.headers.get("x-restli-id") ?? (await res.json().then((j) => j.id).catch(() => ""));
  return { remoteId: id, url: id ? `https://www.linkedin.com/feed/update/${id}` : "https://www.linkedin.com" };
}

/* ---------------- Meta (Facebook Page + Instagram) ---------------- */

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphPost(path: string, params: Record<string, string>) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph ${path.split("?")[0]} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function publishFacebook(
  account: SocialAccount,
  message: string,
  media: PublishMedia[],
): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("Facebook token unavailable — reconnect");
  const meta = parseJson<{ remoteId?: string }>(account.metadata, {});
  const pageId = meta.remoteId;
  if (!pageId) throw new Error("Facebook account missing Page id — reconnect");

  const images = media.filter((m) => m.kind === "image" || m.mimeType.startsWith("image/"));
  const video = media.find((m) => m.kind === "video" || m.mimeType.startsWith("video/"));

  if (video) {
    const j = (await graphPost(`${pageId}/videos`, {
      file_url: video.url,
      description: message,
      access_token: token,
    })) as { id: string };
    return { remoteId: j.id, url: `https://www.facebook.com/${j.id}` };
  }

  if (images.length === 1) {
    const j = (await graphPost(`${pageId}/photos`, {
      url: images[0].url,
      caption: message,
      access_token: token,
    })) as { id: string; post_id?: string };
    return { remoteId: j.post_id ?? j.id, url: `https://www.facebook.com/${j.post_id ?? j.id}` };
  }

  if (images.length > 1) {
    // Upload each unpublished, then attach to a single feed post.
    const ids = await Promise.all(
      images.slice(0, 10).map(async (im) => {
        const p = (await graphPost(`${pageId}/photos`, {
          url: im.url,
          published: "false",
          access_token: token,
        })) as { id: string };
        return p.id;
      }),
    );
    const body: Record<string, string> = { message, access_token: token };
    ids.forEach((id, i) => (body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    const j = (await graphPost(`${pageId}/feed`, body)) as { id: string };
    return { remoteId: j.id, url: `https://www.facebook.com/${j.id}` };
  }

  const j = (await graphPost(`${pageId}/feed`, { message, access_token: token })) as { id: string };
  return { remoteId: j.id, url: `https://www.facebook.com/${j.id}` };
}

async function publishInstagram(
  account: SocialAccount,
  caption: string,
  media: PublishMedia[],
): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("Instagram token unavailable — reconnect");
  const meta = parseJson<{ remoteId?: string }>(account.metadata, {});
  const igId = meta.remoteId;
  if (!igId) throw new Error("Instagram account id missing — reconnect");

  const image = media.find((m) => m.kind === "image" || m.mimeType.startsWith("image/"));
  const video = media.find((m) => m.kind === "video" || m.mimeType.startsWith("video/"));
  if (!image && !video) throw new Error("Instagram posts require an image or video");

  // Step 1 — create a media container.
  const containerParams: Record<string, string> = { caption, access_token: token };
  if (video) {
    containerParams.media_type = "REELS";
    containerParams.video_url = video.url;
  } else {
    containerParams.image_url = image!.url;
  }
  const container = (await graphPost(`${igId}/media`, containerParams)) as { id: string };

  // Step 2 — publish it. Video containers need a moment to process.
  let lastErr = "";
  for (let attempt = 0; attempt < (video ? 10 : 1); attempt++) {
    try {
      const pub = (await graphPost(`${igId}/media_publish`, {
        creation_id: container.id,
        access_token: token,
      })) as { id: string };
      return { remoteId: pub.id, url: `https://www.instagram.com/p/${pub.id}` };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (!video) break;
      await new Promise((r) => setTimeout(r, 6000));
    }
  }
  throw new Error(`Instagram publish failed: ${lastErr}`);
}

/* ---------------- Threads ---------------- */

const THREADS = "https://graph.threads.net/v1.0";

async function threadsPost(path: string, params: Record<string, string>) {
  const res = await fetch(`${THREADS}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Threads ${path.split("?")[0]} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function publishThreads(
  account: SocialAccount,
  text: string,
  media: PublishMedia[],
): Promise<PublishResult> {
  // ponytail: Threads long-lived token lasts ~60d and has no refresh_token;
  // refreshIfNeeded returns the stored token as-is. Wire th_refresh_token if
  // accounts start expiring.
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("Threads token unavailable — reconnect");
  const meta = parseJson<{ remoteId?: string }>(account.metadata, {});
  const userId = meta.remoteId;
  if (!userId) throw new Error("Threads account id missing — reconnect");

  const image = media.find((m) => m.kind === "image" || m.mimeType.startsWith("image/"));
  const video = media.find((m) => m.kind === "video" || m.mimeType.startsWith("video/"));

  // Step 1 — create a media container. Single item only (no carousel yet).
  const c: Record<string, string> = { text, access_token: token };
  if (video) {
    c.media_type = "VIDEO";
    c.video_url = video.url;
  } else if (image) {
    c.media_type = "IMAGE";
    c.image_url = image.url;
  } else {
    c.media_type = "TEXT";
  }
  const container = (await threadsPost(`${userId}/threads`, c)) as { id: string };

  // Step 2 — publish. Video containers need time to process.
  let lastErr = "";
  for (let attempt = 0; attempt < (video ? 10 : 1); attempt++) {
    try {
      const pub = (await threadsPost(`${userId}/threads_publish`, {
        creation_id: container.id,
        access_token: token,
      })) as { id: string };
      const handle = account.handle.replace(/^@/, "");
      return { remoteId: pub.id, url: `https://www.threads.net/@${handle}/post/${pub.id}` };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (!video) break;
      await new Promise((r) => setTimeout(r, 6000));
    }
  }
  throw new Error(`Threads publish failed: ${lastErr}`);
}

/* ---------------- X ---------------- */

async function publishX(account: SocialAccount, text: string): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("X token unavailable — reconnect");

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 280) }),
  });
  if (!res.ok) throw new Error(`X ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { data: { id: string } };
  const handle = account.handle.replace(/^@/, "");
  return { remoteId: j.data.id, url: `https://x.com/${handle}/status/${j.data.id}` };
}

export function logPublishFailure(platform: string, err: unknown) {
  logger.warn({ platform, err: String(err) }, "real publish failed");
}
