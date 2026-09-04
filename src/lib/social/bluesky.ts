/**
 * Bluesky (AT Protocol) — app-password auth. No developer app / OAuth needed:
 * the user creates an app password at https://bsky.app/settings/app-passwords
 * and we hold a session (accessJwt/refreshJwt) against their PDS.
 */

const DEFAULT_PDS = "https://bsky.social";

type Session = { accessJwt: string; refreshJwt: string; did: string; handle: string };

async function xrpc<T>(pds: string, method: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${pds}/xrpc/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function blueskyLogin(identifier: string, appPassword: string, pds = DEFAULT_PDS): Promise<Session> {
  return xrpc<Session>(pds, "com.atproto.server.createSession", {
    body: { identifier: identifier.replace(/^@/, ""), password: appPassword },
  });
}

export async function blueskyRefresh(refreshJwt: string, pds = DEFAULT_PDS): Promise<Session> {
  return xrpc<Session>(pds, "com.atproto.server.refreshSession", { token: refreshJwt });
}

/** Real profile stats for a connected account. app.bsky.actor.getProfile is a GET. */
export async function blueskyGetProfile(
  actor: string,
  accessJwt: string,
  pds = DEFAULT_PDS,
): Promise<{ followersCount: number; followsCount: number; postsCount: number; displayName?: string; avatar?: string }> {
  const res = await fetch(
    `${pds}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
    { headers: { authorization: `Bearer ${accessJwt}` } },
  );
  if (!res.ok) throw new Error(`getProfile -> ${res.status}`);
  const p = (await res.json()) as {
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
    displayName?: string;
    avatar?: string;
  };
  return {
    followersCount: p.followersCount ?? 0,
    followsCount: p.followsCount ?? 0,
    postsCount: p.postsCount ?? 0,
    displayName: p.displayName,
    avatar: p.avatar,
  };
}

type BlobRef = { $type: "blob"; ref: { $link: string }; mimeType: string; size: number };

const MAX_BLOB_BYTES = 1_000_000; // PDS hard limit per blob

/** Upload raw bytes to the user's PDS. Returns the blob ref for an embed. */
export async function blueskyUploadBlob(
  bytes: Uint8Array,
  mimeType: string,
  accessJwt: string,
  pds = DEFAULT_PDS,
): Promise<BlobRef> {
  if (bytes.byteLength > MAX_BLOB_BYTES) {
    throw new Error(`Image is ${(bytes.byteLength / 1e6).toFixed(1)}MB — Bluesky's limit is 1MB.`);
  }
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: { "content-type": mimeType, authorization: `Bearer ${accessJwt}` },
    body: bytes as BodyInit,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`uploadBlob -> ${res.status} ${text.slice(0, 200)}`);
  return (JSON.parse(text) as { blob: BlobRef }).blob;
}

export type BlueskyImage = { url: string; mimeType: string; alt: string };

/** Create a post, optionally with up to 4 images. Returns the public URL + AT-URI. */
export async function blueskyPost(args: {
  pds?: string;
  accessJwt: string;
  did: string;
  handle: string;
  text: string;
  images?: BlueskyImage[];
}): Promise<{ url: string; uri: string; cid: string }> {
  const pds = args.pds ?? DEFAULT_PDS;

  let embed: unknown;
  const imgs = (args.images ?? []).slice(0, 4);
  if (imgs.length > 0) {
    const uploaded = await Promise.all(
      imgs.map(async (im) => {
        const r = await fetch(im.url);
        if (!r.ok) throw new Error(`fetch media ${r.status}`);
        const buf = new Uint8Array(await r.arrayBuffer());
        const blob = await blueskyUploadBlob(buf, im.mimeType || "image/jpeg", args.accessJwt, pds);
        return { alt: (im.alt ?? "").slice(0, 1000), image: blob };
      }),
    );
    embed = { $type: "app.bsky.embed.images", images: uploaded };
  }

  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text: args.text.slice(0, 300),
    createdAt: new Date().toISOString(),
    langs: ["en"],
    ...(embed ? { embed } : {}),
  };
  const out = await xrpc<{ uri: string; cid: string }>(pds, "com.atproto.repo.createRecord", {
    token: args.accessJwt,
    body: { repo: args.did, collection: "app.bsky.feed.post", record },
  });
  const rkey = out.uri.split("/").pop();
  return { url: `https://bsky.app/profile/${args.handle}/post/${rkey}`, uri: out.uri, cid: out.cid };
}

async function get<T>(pds: string, path: string, accessJwt: string): Promise<T> {
  const res = await fetch(`${pds}/xrpc/${path}`, { headers: { authorization: `Bearer ${accessJwt}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path.split("?")[0]} -> ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

export type BlueskyPostStats = { likes: number; reposts: number; replies: number; quotes: number };

/** Real engagement counts for up to 25 posts by AT-URI. */
export async function blueskyGetPostStats(
  uris: string[],
  accessJwt: string,
  pds = DEFAULT_PDS,
): Promise<Record<string, BlueskyPostStats>> {
  const out: Record<string, BlueskyPostStats> = {};
  for (let i = 0; i < uris.length; i += 25) {
    const batch = uris.slice(i, i + 25);
    const qs = batch.map((u) => `uris=${encodeURIComponent(u)}`).join("&");
    const data = await get<{
      posts: { uri: string; likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number }[];
    }>(pds, `app.bsky.feed.getPosts?${qs}`, accessJwt);
    for (const p of data.posts ?? []) {
      out[p.uri] = {
        likes: p.likeCount ?? 0,
        reposts: p.repostCount ?? 0,
        replies: p.replyCount ?? 0,
        quotes: p.quoteCount ?? 0,
      };
    }
  }
  return out;
}

export type BlueskyNotification = {
  uri: string;
  cid: string;
  reason: "like" | "repost" | "follow" | "mention" | "reply" | "quote" | string;
  isRead: boolean;
  indexedAt: string;
  author: { did: string; handle: string; displayName?: string; avatar?: string };
  record: { text?: string; reply?: { root?: { uri?: string }; parent?: { uri?: string } } };
};

/** Inbound engagement — replies, mentions, quotes (paged). */
export async function blueskyListNotifications(
  accessJwt: string,
  opts: { limit?: number; cursor?: string } = {},
  pds = DEFAULT_PDS,
): Promise<{ notifications: BlueskyNotification[]; cursor?: string }> {
  const qs = new URLSearchParams({ limit: String(opts.limit ?? 50) });
  if (opts.cursor) qs.set("cursor", opts.cursor);
  return get(pds, `app.bsky.notification.listNotifications?${qs}`, accessJwt);
}

/** Post the reply the user drafted in the inbox, threaded under the original. */
export async function blueskyReply(args: {
  pds?: string;
  accessJwt: string;
  did: string;
  text: string;
  parentUri: string;
  parentCid: string;
  rootUri?: string;
  rootCid?: string;
}): Promise<{ uri: string; cid: string }> {
  const pds = args.pds ?? DEFAULT_PDS;
  const parent = { uri: args.parentUri, cid: args.parentCid };
  const root = args.rootUri && args.rootCid ? { uri: args.rootUri, cid: args.rootCid } : parent;
  const record = {
    $type: "app.bsky.feed.post",
    text: args.text.slice(0, 300),
    createdAt: new Date().toISOString(),
    langs: ["en"],
    reply: { root, parent },
  };
  return xrpc(pds, "com.atproto.repo.createRecord", {
    token: args.accessJwt,
    body: { repo: args.did, collection: "app.bsky.feed.post", record },
  });
}
