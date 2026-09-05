import type { SocialAccount, SocialChannel } from "@prisma/client";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/utils";
import { isRealToken } from "@/lib/social/crypto";
import { getProvider } from "@/lib/social/providers";
import { splitThread } from "@/lib/social/capabilities";
import { refreshIfNeeded } from "@/lib/social/oauth";
import { blueskyPost, type BlueskyImage } from "@/lib/social/bluesky";
import { runWithBluesky } from "@/lib/social/bluesky-session";

/**
 * Real per-platform publishing. `queue.ts` calls `publishToPlatform` for any
 * channel whose account has real credentials (`canPublishReal`); everything
 * else stays on the simulated path.
 *
 * Implemented for real today: bluesky (app-password), facebook, instagram,
 * threads, youtube, linkedin, x, tiktok, pinterest (need their OAuth app
 * credentials). gbp throws NotImplemented — the Business Profile API needs
 * per-project allowlisting from Google plus account/location discovery at
 * connect time, neither of which is wired yet.
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
  contentType = "post",
): Promise<PublishResult> {
  switch (account.platform) {
    case "bluesky":
      return publishBluesky(account, channel, body, media);
    case "linkedin":
      return publishLinkedIn(account, body);
    case "facebook":
      return publishFacebook(account, body, media, contentType);
    case "instagram":
      return publishInstagram(account, body, media, contentType);
    case "threads":
      return publishThreads(account, body, media);
    case "youtube":
      return publishYouTube(account, body, media, contentType);
    case "x":
      return publishX(account, body, contentType);
    case "tiktok":
      return publishTikTok(account, body, media);
    case "pinterest":
      return publishPinterest(account, body, media);
    default:
      throw new PublishNotImplemented(account.platform);
  }
}

/* ---------------- Pinterest ---------------- */

const PINTEREST_API = "https://api.pinterest.com/v5";

/**
 * Pinterest Pin creation.
 *
 * A Pin must live on a board and must have an image, so both are resolved
 * before posting: the board is whichever one the connect flow stored in
 * `metadata.boardId`, else the account's first board. Pinterest fetches the
 * image itself from `image_url`, which is why the media has to be on a public
 * URL (it is — see adapters/storage.ts).
 */
async function publishPinterest(
  account: SocialAccount,
  body: string,
  media: PublishMedia[],
): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("Pinterest token unavailable — reconnect");

  const image = media.find((m) => m.kind === "image" || m.mimeType.startsWith("image/"));
  if (!image) throw new Error("Pinterest publishing requires an image attachment");

  const auth = { authorization: `Bearer ${token}` };

  // Board: prefer one chosen at connect time, otherwise the first available.
  const meta = parseJson<{ boardId?: string }>(account.metadata ?? "{}", {});
  let boardId = meta.boardId;
  if (!boardId) {
    const bres = await fetch(`${PINTEREST_API}/boards?page_size=1`, { headers: auth });
    if (!bres.ok) throw new Error(`Pinterest boards ${bres.status}: ${(await bres.text()).slice(0, 200)}`);
    const boards = (await bres.json()) as { items?: { id: string }[] };
    boardId = boards.items?.[0]?.id;
  }
  if (!boardId) throw new Error("No Pinterest board found — create a board on Pinterest first");

  // First line becomes the Pin title (Pinterest caps it at 100), the rest the
  // description.
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] ?? "New Pin").slice(0, 100);

  const res = await fetch(`${PINTEREST_API}/pins`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      board_id: boardId,
      title,
      description: body.slice(0, 800),
      alt_text: image.altText ? image.altText.slice(0, 500) : undefined,
      media_source: { source_type: "image_url", url: image.url },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Pinterest pin ${res.status}: ${text.slice(0, 300)}`);
  const pin = JSON.parse(text) as { id: string };
  return { remoteId: pin.id, url: `https://www.pinterest.com/pin/${pin.id}/` };
}

/* ---------------- TikTok ---------------- */

const TIKTOK_API = "https://open.tiktokapis.com/v2";

/**
 * TikTok Content Posting API (Direct Post).
 *
 * Three steps: init the upload, PUT the bytes to the returned upload_url, then
 * poll for the publish status. We use FILE_UPLOAD rather than PULL_FROM_URL
 * because PULL_FROM_URL requires the media host to be a domain verified in the
 * TikTok developer portal — our media sits on an R2 bucket URL, which isn't.
 *
 * Until the TikTok app passes review, TikTok forces every post from an
 * unaudited client to SELF_ONLY (visible only to the posting account). That's
 * TikTok's rule, not ours — the post really is created, it just isn't public.
 */
async function publishTikTok(
  account: SocialAccount,
  body: string,
  media: PublishMedia[],
): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("TikTok token unavailable — reconnect");

  const video = media.find((m) => m.kind === "video" || m.mimeType.startsWith("video/"));
  if (!video) throw new Error("TikTok publishing requires a video attachment");

  const vres = await fetch(video.url);
  if (!vres.ok) throw new Error(`Could not fetch the video (${vres.status})`);
  const bytes = new Uint8Array(await vres.arrayBuffer());
  // Single-chunk upload — TikTok allows one chunk up to 64 MB. Bigger files
  // need chunked upload, which isn't wired yet; fail clearly rather than
  // half-upload and leave a stuck draft on their side.
  if (bytes.length > 64 * 1024 * 1024) {
    throw new Error("Video is over 64 MB — chunked TikTok uploads aren't supported yet");
  }

  const auth = { authorization: `Bearer ${token}` };

  const initRes = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title: body.slice(0, 2200),
        privacy_level: "PUBLIC_TO_EVERYONE", // downgraded to SELF_ONLY by TikTok while unaudited
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: bytes.length,
        chunk_size: bytes.length,
        total_chunk_count: 1,
      },
    }),
  });
  const initText = await initRes.text();
  if (!initRes.ok) throw new Error(`TikTok init ${initRes.status}: ${initText.slice(0, 300)}`);
  const init = JSON.parse(initText) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { code?: string; message?: string };
  };
  if (init.error?.code && init.error.code !== "ok") {
    throw new Error(`TikTok init failed: ${init.error.message ?? init.error.code}`);
  }
  const publishId = init.data?.publish_id;
  const uploadUrl = init.data?.upload_url;
  if (!publishId || !uploadUrl) throw new Error("TikTok did not return an upload URL");

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": video.mimeType || "video/mp4",
      "content-length": String(bytes.length),
      "content-range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
    },
    body: bytes,
  });
  if (!put.ok) throw new Error(`TikTok upload ${put.status}: ${(await put.text()).slice(0, 200)}`);

  // Poll briefly for a terminal state so a rejected post surfaces as a real
  // failure instead of silently sitting in TikTok's inbox.
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ publish_id: publishId }),
    });
    if (!st.ok) continue;
    const s = (await st.json()) as {
      data?: { status?: string; fail_reason?: string; publicaly_available_post_id?: string[] };
    };
    const status = s.data?.status;
    if (status === "PUBLISH_COMPLETE") {
      const postId = s.data?.publicaly_available_post_id?.[0];
      return {
        remoteId: postId ?? publishId,
        url: postId
          ? `https://www.tiktok.com/@${account.handle.replace(/^@/, "")}/video/${postId}`
          : `https://www.tiktok.com/@${account.handle.replace(/^@/, "")}`,
      };
    }
    if (status === "FAILED") {
      throw new Error(`TikTok rejected the video: ${s.data?.fail_reason ?? "unknown reason"}`);
    }
  }

  // Still processing — the upload succeeded, TikTok just hasn't finished.
  // Return the publish id so it's traceable rather than reporting a failure.
  return {
    remoteId: publishId,
    url: `https://www.tiktok.com/@${account.handle.replace(/^@/, "")}`,
  };
}

/* ---------------- Bluesky ---------------- */

async function publishBluesky(
  account: SocialAccount,
  channel: SocialChannel,
  text: string,
  media: PublishMedia[] = [],
): Promise<PublishResult> {
  const meta = parseJson<{ did?: string }>(account.metadata, {});
  if (!meta.did) throw new Error("Bluesky account missing did — reconnect it");

  const handle = channel.handle.replace(/^@/, "");
  // Bluesky embeds up to 4 images. Video needs a separate flow — skipped for now.
  const images: BlueskyImage[] = media
    .filter((m) => m.kind === "image" || m.mimeType.startsWith("image/"))
    .slice(0, 4)
    .map((m) => ({ url: m.url, mimeType: m.mimeType, alt: m.altText }));

  // runWithBluesky handles the ~2h access-JWT expiry: refresh + persist + retry.
  const r = await runWithBluesky(account, (jwt, pds) =>
    blueskyPost({ pds, accessJwt: jwt, did: meta.did!, handle, text, images }),
  );
  return { remoteId: r.uri, url: r.url };
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
  contentType = "post",
): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("Facebook token unavailable — reconnect");
  const meta = parseJson<{ remoteId?: string }>(account.metadata, {});
  const pageId = meta.remoteId;
  if (!pageId) throw new Error("Facebook account missing Page id — reconnect");

  const images = media.filter((m) => m.kind === "image" || m.mimeType.startsWith("image/"));
  const video = media.find((m) => m.kind === "video" || m.mimeType.startsWith("video/"));

  // ponytail: Facebook Reels use a 3-step resumable upload API (video_reels)
  // that isn't wired yet — a "reel" ships as a normal Page video for now.
  void contentType;

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

async function igPublish(igId: string, token: string, creationId: string, isVideo: boolean): Promise<string> {
  let lastErr = "";
  for (let attempt = 0; attempt < (isVideo ? 12 : 1); attempt++) {
    try {
      const pub = (await graphPost(`${igId}/media_publish`, {
        creation_id: creationId,
        access_token: token,
      })) as { id: string };
      return pub.id;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (!isVideo) break;
      await new Promise((r) => setTimeout(r, 6000));
    }
  }
  throw new Error(`Instagram publish failed: ${lastErr}`);
}

async function publishInstagram(
  account: SocialAccount,
  caption: string,
  media: PublishMedia[],
  contentType = "post",
): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("Instagram token unavailable — reconnect");
  const meta = parseJson<{ remoteId?: string }>(account.metadata, {});
  const igId = meta.remoteId;
  if (!igId) throw new Error("Instagram account id missing — reconnect");

  const images = media.filter((m) => m.kind === "image" || m.mimeType.startsWith("image/"));
  const video = media.find((m) => m.kind === "video" || m.mimeType.startsWith("video/"));
  if (media.length === 0) throw new Error("Instagram posts require an image or video");

  // Carousel — up to 10 image/video children in one post.
  if (contentType === "carousel") {
    const items = media.slice(0, 10);
    const childIds = await Promise.all(
      items.map(async (m) => {
        const isVid = m.kind === "video" || m.mimeType.startsWith("video/");
        const p = (await graphPost(`${igId}/media`, {
          is_carousel_item: "true",
          ...(isVid ? { media_type: "VIDEO", video_url: m.url } : { image_url: m.url }),
          access_token: token,
        })) as { id: string };
        return p.id;
      }),
    );
    const parent = (await graphPost(`${igId}/media`, {
      media_type: "CAROUSEL",
      caption,
      children: childIds.join(","),
      access_token: token,
    })) as { id: string };
    const id = await igPublish(igId, token, parent.id, true);
    return { remoteId: id, url: `https://www.instagram.com/p/${id}` };
  }

  // Single-item: reel / story / feed post.
  const params: Record<string, string> = { caption, access_token: token };
  if (video) {
    params.video_url = video.url;
    params.media_type = contentType === "story" ? "STORIES" : "REELS";
  } else {
    params.image_url = images[0].url;
    if (contentType === "story") params.media_type = "STORIES";
  }
  const container = (await graphPost(`${igId}/media`, params)) as { id: string };
  const id = await igPublish(igId, token, container.id, !!video);
  return { remoteId: id, url: `https://www.instagram.com/p/${id}` };
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

/* ---------------- YouTube ---------------- */

async function publishYouTube(
  account: SocialAccount,
  body: string,
  media: PublishMedia[],
  contentType = "video",
): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("YouTube token unavailable — reconnect");

  const video = media.find((m) => m.kind === "video" || m.mimeType.startsWith("video/"));
  if (!video) throw new Error("YouTube publishing requires a video attachment");

  // A Short is just a vertical, < 3-min upload; adding #Shorts helps YouTube
  // classify it. The vertical ratio + length are enforced by validateChannel.
  const shortsTag = contentType === "short" && !/#shorts\b/i.test(body) ? "\n#Shorts" : "";

  const vres = await fetch(video.url);
  if (!vres.ok) throw new Error(`Could not fetch the video (${vres.status})`);
  const bytes = new Uint8Array(await vres.arrayBuffer());
  // ponytail: single-shot multipart upload. Large files need the resumable
  // protocol — cap here to protect the serverless function's memory.
  if (bytes.length > 128 * 1024 * 1024) {
    throw new Error("Video is over 128 MB — large YouTube uploads aren't supported yet");
  }

  const description = (body + shortsTag).slice(0, 4900);
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] ?? "New video").slice(0, 100);
  const tags = (description.match(/#[\p{L}0-9_]+/gu) ?? []).map((h) => h.slice(1)).slice(0, 15);
  const meta = JSON.stringify({
    snippet: { title, description, tags },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  });

  const boundary = `mpb${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: ${video.mimeType || "video/*"}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const payload = new Uint8Array(head.length + bytes.length + tail.length);
  payload.set(head, 0);
  payload.set(bytes, head.length);
  payload.set(tail, head.length + bytes.length);

  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body: payload,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube upload ${res.status}: ${text.slice(0, 300)}`);
  const j = JSON.parse(text) as { id: string };
  return { remoteId: j.id, url: `https://www.youtube.com/watch?v=${j.id}` };
}

/* ---------------- X ---------------- */

async function publishX(account: SocialAccount, text: string, contentType = "post"): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("X token unavailable — reconnect");
  const handle = account.handle.replace(/^@/, "");

  const tweet = async (body: string, replyTo?: string) => {
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        text: body.slice(0, 280),
        ...(replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`X ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return ((await res.json()) as { data: { id: string } }).data.id;
  };

  if (contentType === "thread") {
    const parts = splitThread(text);
    if (parts.length === 0) throw new Error("Thread is empty");
    let firstId = "";
    let lastId: string | undefined;
    for (const p of parts) {
      const id = await tweet(p, lastId);
      if (!firstId) firstId = id;
      lastId = id;
    }
    return { remoteId: firstId, url: `https://x.com/${handle}/status/${firstId}` };
  }

  const id = await tweet(text);
  return { remoteId: id, url: `https://x.com/${handle}/status/${id}` };
}

export function logPublishFailure(platform: string, err: unknown) {
  logger.warn({ platform, err: String(err) }, "real publish failed");
}
