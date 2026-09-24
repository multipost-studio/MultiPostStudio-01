import type { SocialAccount, SocialChannel } from "@prisma/client";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/utils";
import { isRealToken } from "@/lib/social/crypto";
import { getProvider } from "@/lib/social/providers";
import { splitThread, supportsFirstComment } from "@/lib/social/capabilities";
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

/**
 * Resumable-publisher hooks. Multi-step publishers (X threads) persist
 * progress after each step so a retry resumes instead of duplicating.
 * queue.ts binds these to the PostChannel row; other callers omit them.
 */
export type PublishProgressHooks = {
  getRetryState: () => Promise<string | null>;
  setRetryState: (state: string) => Promise<void>;
};

/**
 * Crash-resume helpers (Phase 1A). Multi-step publishers persist the
 * provider's intermediate IDs (container / publish_id / uploaded photo IDs)
 * in PostChannel.retryState and reuse them on retry.
 *
 * Why not provider idempotency keys: none of Facebook, Instagram, Threads,
 * LinkedIn, Bluesky, Pinterest, TikTok, YouTube, or X accept a client
 * idempotency key on these endpoints, so none is sent. Resume-by-persisted-ID
 * is the provider-safe mechanism; single-shot publishers (no intermediate
 * step) intentionally have no resume and rely on the queue's CAS claim,
 * skip-published guard, retryable-error classification, and dead-token
 * handling instead.
 */
type ResumeState =
  | { kind: "completed"; remoteId: string; url?: string; fingerprint: string }
  | { kind: "ig-container"; creationId: string; fingerprint: string }
  | { kind: "ig-carousel"; childIds: string[]; parentId: string; fingerprint: string }
  | { kind: "threads-container"; containerId: string; fingerprint: string }
  | { kind: "tiktok-upload"; publishId: string; videoUrl: string }
  | { kind: "fb-photos"; photoIds: string[]; mediaUrls: string[] };

/**
 * Fingerprint of the exact content a container was created for. A retry
 * reuses saved provider objects ONLY when the post content is byte-identical;
 * any edit (caption, media swap, reorder) falls back to fresh creation.
 * This mirrors the X-thread rule that clears retryState on body change.
 */
function resumeFingerprint(parts: (string | undefined | null)[]): string {
  return JSON.stringify(parts.map((p) => p ?? ""));
}

function readResumeState(raw: string | null | undefined): ResumeState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as ResumeState;
    if (!v || typeof v.kind !== "string") return null;
    return v;
  } catch {
    return null;
  }
}

/** Best-effort persist: resume bookkeeping must never fail a publish. */
async function saveResumeState(hooks: PublishProgressHooks | undefined, state: ResumeState) {
  if (!hooks) return;
  try {
    await hooks.setRetryState(JSON.stringify(state));
  } catch {
    /* publish proceeds; retry simply re-creates (today's behavior) */
  }
}

/**
 * Best-effort read with fail-closed semantics: a resume-read failure throws
 * BEFORE any provider call, so the channel fails honestly instead of
 * re-creating provider objects blindly. The saved state is untouched, so a
 * later manual retry still resumes.
 */
async function loadResumeState(hooks: PublishProgressHooks | undefined): Promise<ResumeState | null> {
  if (!hooks) return null;
  try {
    return readResumeState(await hooks.getRetryState());
  } catch {
    throw new Error("Could not read publish resume state — retrying safely");
  }
}

/**
 * Transient vs permanent publish failures. Rate limits, 5xx, and network
 * errors are worth an automatic retry with backoff; auth/validation errors
 * (401/403/404/422, missing tokens, bad input) would fail identically, so
 * they go straight to failed for the user to fix. queue.ts uses this to
 * decide requeue-vs-terminal.
 */
export function isRetryablePublishError(message: string): boolean {
  const msg = String(message ?? "");
  if (/\b(401|403|404|422|400)\b/.test(msg)) return false;
  if (/\b(429|5\d\d)\b/.test(msg)) return true;
  // NOTE: no bare "econn" — it matches "reconnect", which marks dead-token
  // messages retryable and would spin refresh-failures through backoff.
  return /rate.?limit|too many requests|timeout|timed out|econnreset|econnrefused|econnaborted|etimedout|eai_again|enotfound|socket hang up|service unavailable|bad gateway|gateway timeout|overloaded|temporar|fetch failed|network error/i.test(
    msg,
  );
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
  hooks?: PublishProgressHooks,
): Promise<PublishResult> {
  // These publishers take text only — they have no media parameter, so an
  // attachment would be dropped silently and the post would still report
  // success. Composer validation blocks this first (capabilities.ts
  // mediaUnsupported), but that is UX: refuse here too so a direct server
  // action call cannot lose a user's media without telling them.
  if (media.length > 0 && (account.platform === "linkedin" || account.platform === "x")) {
    // Throwing is the failure channel here: queue.ts catches it and marks the
    // PostChannel failed with this message, so the user sees why rather than a
    // success with a missing image.
    throw new Error(
      `Media publishing isn't implemented for ${account.platform === "x" ? "X" : "LinkedIn"} yet — ` +
        `nothing was sent, so the post was not published without its attachment.`,
    );
  }

  const platformFingerprint = resumeFingerprint([
    account.id,
    account.platform,
    body,
    contentType,
    ...media.map((m) => m.url),
  ]);

  const prior = await loadResumeState(hooks);
  if (
    prior?.kind === "completed" &&
    prior.fingerprint === platformFingerprint &&
    typeof prior.remoteId === "string" &&
    prior.remoteId.length > 0
  ) {
    return { remoteId: prior.remoteId, url: prior.url ?? "" };
  }

  const result = await (async (): Promise<PublishResult> => {
    switch (account.platform) {
      case "bluesky":
        return publishBluesky(account, channel, body, media);
      case "linkedin":
        return publishLinkedIn(account, body);
      case "facebook":
        return publishFacebook(account, body, media, contentType, hooks);
      case "instagram":
        return publishInstagram(account, body, media, contentType, hooks);
      case "threads":
        return publishThreads(account, body, media, hooks);
      case "youtube":
        return publishYouTube(account, body, media, contentType);
      case "x":
        return publishX(account, body, contentType, hooks);
      case "tiktok":
        return publishTikTok(account, body, media, hooks);
      case "pinterest":
        return publishPinterest(account, body, media);
      default:
        throw new PublishNotImplemented(account.platform);
    }
  })();

  if (result?.remoteId) {
    await saveResumeState(hooks, {
      kind: "completed",
      remoteId: result.remoteId,
      url: result.url,
      fingerprint: platformFingerprint,
    });
  }

  return result;
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
  hooks?: PublishProgressHooks,
): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("TikTok token unavailable — reconnect");

  const video = media.find((m) => m.kind === "video" || m.mimeType.startsWith("video/"));
  if (!video) throw new Error("TikTok publishing requires a video attachment");

  const auth = { authorization: `Bearer ${token}` };

  // Resume check: if a previous attempt uploaded and saved publishId, check status first
  const saved = await loadResumeState(hooks);
  if (saved?.kind === "tiktok-upload" && saved.videoUrl === video.url) {
    const st = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ publish_id: saved.publishId }),
    });
    if (st.status === 429 || st.status >= 500) {
      throw new Error(`TikTok status check ${st.status} — retryable`);
    }
    if (st.ok) {
      const s = (await st.json()) as {
        data?: { status?: string; fail_reason?: string; publicaly_available_post_id?: string[] };
      };
      const status = s.data?.status;
      if (status === "PUBLISH_COMPLETE" || status === "COMPLETE") {
        const postId =
          s.data?.publicaly_available_post_id?.[0] ??
          (s.data as { public_post_id?: string[] })?.public_post_id?.[0];
        return {
          remoteId: postId ?? saved.publishId,
          url: postId
            ? `https://www.tiktok.com/@${account.handle.replace(/^@/, "")}/video/${postId}`
            : `https://www.tiktok.com/@${account.handle.replace(/^@/, "")}`,
        };
      }
      if (status === "PROCESSING") {
        return {
          remoteId: saved.publishId,
          url: `https://www.tiktok.com/@${account.handle.replace(/^@/, "")}`,
        };
      }
      // If status is "FAILED", fall through to fresh init + upload
    }
  }

  const { fetchBytesWithLimit } = await import("@/lib/fetch-limited");
  let bytes: Uint8Array;
  try {
    ({ bytes } = await fetchBytesWithLimit(video.url, { maxBytes: 64 * 1024 * 1024, timeoutMs: 30_000 }));
  } catch (e) {
    throw new Error(`Could not fetch the video (${e instanceof Error ? e.message : String(e)})`);
  }
  // Single-chunk upload — TikTok allows one chunk up to 64 MB. Bigger files
  // need chunked upload, which isn't wired yet; fail clearly rather than
  // half-upload and leave a stuck draft on their side.

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

  await saveResumeState(hooks, { kind: "tiktok-upload", publishId, videoUrl: video.url });

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": video.mimeType || "video/mp4",
      "content-length": String(bytes.length),
      "content-range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
    },
    body: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as unknown as BodyInit,
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
  hooks?: PublishProgressHooks,
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
    const wanted = images.slice(0, 10);
    const wantedUrls = wanted.map((im) => im.url);
    const saved = await loadResumeState(hooks);
    let ids: string[];
    if (
      saved?.kind === "fb-photos" &&
      Array.isArray(saved.photoIds) &&
      saved.photoIds.length === wanted.length &&
      saved.photoIds.every((id) => typeof id === "string" && id.length > 0) &&
      JSON.stringify(saved.mediaUrls) === JSON.stringify(wantedUrls)
    ) {
      ids = saved.photoIds;
    } else {
      ids = await Promise.all(
        wanted.map(async (im) => {
          const p = (await graphPost(`${pageId}/photos`, {
            url: im.url,
            published: "false",
            access_token: token,
          })) as { id: string };
          return p.id;
        }),
      );
      await saveResumeState(hooks, { kind: "fb-photos", photoIds: ids, mediaUrls: wantedUrls });
    }
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
  hooks?: PublishProgressHooks,
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
    const fingerprint = resumeFingerprint([caption, ...items.map((m) => m.url)]);
    const saved = await loadResumeState(hooks);
    let parentId: string;
    if (
      saved?.kind === "ig-carousel" &&
      Array.isArray(saved.childIds) &&
      saved.childIds.length === items.length &&
      typeof saved.parentId === "string" &&
      saved.parentId.length > 0 &&
      saved.fingerprint === fingerprint
    ) {
      parentId = saved.parentId;
    } else {
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
      parentId = parent.id;
      await saveResumeState(hooks, { kind: "ig-carousel", childIds, parentId, fingerprint });
    }
    const id = await igPublish(igId, token, parentId, true);
    return { remoteId: id, url: `https://www.instagram.com/p/${id}` };
  }

  // Single-item: reel / story / feed post.
  const mediaUrl = video ? video.url : (images[0]?.url ?? "");
  const singleFingerprint = resumeFingerprint([caption, mediaUrl, contentType]);
  const savedSingle = await loadResumeState(hooks);
  let creationId: string;
  if (
    savedSingle?.kind === "ig-container" &&
    typeof savedSingle.creationId === "string" &&
    savedSingle.creationId.length > 0 &&
    savedSingle.fingerprint === singleFingerprint
  ) {
    creationId = savedSingle.creationId;
  } else {
    const params: Record<string, string> = { caption, access_token: token };
    if (video) {
      params.video_url = video.url;
      params.media_type = contentType === "story" ? "STORIES" : "REELS";
    } else {
      params.image_url = images[0].url;
      if (contentType === "story") params.media_type = "STORIES";
    }
    const container = (await graphPost(`${igId}/media`, params)) as { id: string };
    creationId = container.id;
    await saveResumeState(hooks, { kind: "ig-container", creationId, fingerprint: singleFingerprint });
  }
  const id = await igPublish(igId, token, creationId, !!video);
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
  hooks?: PublishProgressHooks,
): Promise<PublishResult> {
  // Threads long-lived tokens rotate proactively inside 7 days via
  // th_refresh_token (see refreshIfNeeded) — no manual re-auth cliff.
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("Threads token unavailable — reconnect");
  const meta = parseJson<{ remoteId?: string }>(account.metadata, {});
  const userId = meta.remoteId;
  if (!userId) throw new Error("Threads account id missing — reconnect");

  const image = media.find((m) => m.kind === "image" || m.mimeType.startsWith("image/"));
  const video = media.find((m) => m.kind === "video" || m.mimeType.startsWith("video/"));

  // Step 1 — create a media container. Single item only (no carousel yet).
  const fingerprint = resumeFingerprint([
    text,
    video ? video.url : (image ? image.url : ""),
  ]);
  const saved = await loadResumeState(hooks);
  let containerId: string;
  if (
    saved?.kind === "threads-container" &&
    typeof saved.containerId === "string" &&
    saved.containerId.length > 0 &&
    saved.fingerprint === fingerprint
  ) {
    containerId = saved.containerId;
  } else {
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
    containerId = container.id;
    await saveResumeState(hooks, { kind: "threads-container", containerId, fingerprint });
  }

  // Step 2 — publish. Video containers need time to process.
  let lastErr = "";
  for (let attempt = 0; attempt < (video ? 10 : 1); attempt++) {
    try {
      const pub = (await threadsPost(`${userId}/threads_publish`, {
        creation_id: containerId,
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

  const { fetchBytesWithLimit: fetchCapped } = await import("@/lib/fetch-limited");
  let bytes: Uint8Array;
  try {
    // ponytail: single-shot multipart upload. Large files need the resumable
    // protocol — cap here to protect the serverless function's memory.
    ({ bytes } = await fetchCapped(video.url, { maxBytes: 128 * 1024 * 1024, timeoutMs: 45_000 }));
  } catch (e) {
    throw new Error(`Could not fetch the video (${e instanceof Error ? e.message : String(e)})`);
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

async function publishX(
  account: SocialAccount,
  text: string,
  contentType = "post",
  hooks?: PublishProgressHooks,
): Promise<PublishResult> {
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
    if (res.status === 429) {
      throw new Error(
        `X rate limited (429) — the connected API tier's write cap is exhausted; retry later. ${(await res.text()).slice(0, 200)}`,
      );
    }
    if (res.status === 403) {
      throw new Error(
        `X forbidden (403) — the connected API tier likely lacks write access; check the X developer portal. ${(await res.text()).slice(0, 200)}`,
      );
    }
    if (!res.ok) throw new Error(`X ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return ((await res.json()) as { data: { id: string } }).data.id;
  };

  if (contentType === "thread") {
    const parts = splitThread(text);
    if (parts.length === 0) throw new Error("Thread is empty");
    // Resume, don't reduplicate: posted tweet ids persist after every step,
    // so a crash/retry continues the thread where it stopped instead of
    // re-posting the opening tweets to the author's followers.
    let posted: string[] = [];
    try {
      const raw = await hooks?.getRetryState();
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) posted = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      posted = [];
    }
    let lastId: string | undefined = posted.length > 0 ? posted[posted.length - 1] : undefined;
    const firstId = posted[0] ?? "";
    for (let i = posted.length; i < parts.length; i++) {
      const id = await tweet(parts[i], lastId);
      posted.push(id);
      lastId = id;
      await hooks?.setRetryState(JSON.stringify(posted));
    }
    const head = firstId || posted[0];
    return { remoteId: head, url: `https://x.com/${handle}/status/${head}` };
  }

  const id = await tweet(text);
  return { remoteId: id, url: `https://x.com/${handle}/status/${id}` };
}

/* ---------------- First comment ---------------- */

/**
 * Post the first comment on something we just published.
 *
 * The composer has collected `firstComment` since day one and the publisher
 * never used it: the field was stored, copied on duplicate and recycle, and
 * returned by the public API, but nothing ever posted it. The two reasons
 * people rely on it are why that matters — LinkedIn demotes posts with links
 * in the body, so the convention is "link in comments", and Instagram captions
 * stay clean by putting the hashtag block in the first comment.
 *
 * Throws `CommentNotSupported` for platforms with no comment path wired. The
 * caller must treat every failure here as non-fatal: the post is already live,
 * and a missing comment is not a reason to mark a published post failed.
 */
export class CommentNotSupported extends Error {
  constructor(platform: string) {
    super(`First comment isn't supported for ${platform} yet`);
    this.name = "CommentNotSupported";
  }
}

export async function postFirstComment(
  account: SocialAccount,
  remoteId: string,
  text: string,
): Promise<void> {
  const body = text.trim();
  if (!body || !remoteId) return;
  // Same list the connect dialog advertises, so the UI cannot promise a first
  // comment on a platform this function would refuse.
  if (!supportsFirstComment(account.platform)) throw new CommentNotSupported(account.platform);

  switch (account.platform) {
    case "instagram":
    case "facebook": {
      // Same Graph endpoint for both: a comment on the published node.
      const token = await refreshIfNeeded(account.id);
      if (!token) throw new Error(`${account.platform} token unavailable — reconnect`);
      await graphPost(`${remoteId}/comments`, { message: body, access_token: token });
      return;
    }

    case "threads": {
      const token = await refreshIfNeeded(account.id);
      if (!token) throw new Error("Threads token unavailable — reconnect");
      const meta = parseJson<{ remoteId?: string }>(account.metadata, {});
      if (!meta.remoteId) throw new Error("Threads account missing user id — reconnect");
      // Two-step like every Threads publish: build a container, then publish it.
      const container = await threadsPost(`${meta.remoteId}/threads`, {
        media_type: "TEXT",
        text: body,
        reply_to_id: remoteId,
        access_token: token,
      });
      await threadsPost(`${meta.remoteId}/threads_publish`, {
        creation_id: String(container.id),
        access_token: token,
      });
      return;
    }

    case "x": {
      const token = await refreshIfNeeded(account.id);
      if (!token) throw new Error("X token unavailable — reconnect");
      const res = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          text: body.slice(0, 280),
          reply: { in_reply_to_tweet_id: remoteId },
        }),
      });
      if (!res.ok) throw new Error(`X comment ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return;
    }

    case "linkedin": {
      const token = await refreshIfNeeded(account.id);
      if (!token) throw new Error("LinkedIn token unavailable — reconnect");
      const meta = parseJson<{ remoteId?: string }>(account.metadata, {});
      if (!meta.remoteId) throw new Error("LinkedIn account missing member id — reconnect");
      // socialActions keys off the URN of the post, which is what ugcPosts
      // returned to us as remoteId.
      const res = await fetch(
        `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(remoteId)}/comments`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
          },
          body: JSON.stringify({
            actor: `urn:li:person:${meta.remoteId}`,
            message: { text: body },
          }),
        },
      );
      if (!res.ok) {
        throw new Error(`LinkedIn comment ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      return;
    }

    // Bluesky replies need the root record's cid as well as its uri, and
    // YouTube comments need a scope we don't request at connect time. Both are
    // refused rather than silently dropped.
    default:
      throw new CommentNotSupported(account.platform);
  }
}

export function logPublishFailure(platform: string, err: unknown, ctx?: { jobId?: string; postId?: string; channelId?: string }) {
  // jobId/postId/channelId let an operator correlate one platform failure
  // across tick logs, channel rows, and job rows (no PII beyond ids).
  logger.warn({ platform, err: String(err), ...ctx }, "real publish failed");
}
