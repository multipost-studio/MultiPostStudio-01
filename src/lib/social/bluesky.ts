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

/** Create a text post. Returns the public URL + AT-URI. */
export async function blueskyPost(
  args: { pds?: string; accessJwt: string; did: string; handle: string; text: string },
): Promise<{ url: string; uri: string; cid: string }> {
  const pds = args.pds ?? DEFAULT_PDS;
  const record = {
    $type: "app.bsky.feed.post",
    text: args.text.slice(0, 300),
    createdAt: new Date().toISOString(),
    langs: ["en"],
  };
  const out = await xrpc<{ uri: string; cid: string }>(pds, "com.atproto.repo.createRecord", {
    token: args.accessJwt,
    body: { repo: args.did, collection: "app.bsky.feed.post", record },
  });
  const rkey = out.uri.split("/").pop();
  return { url: `https://bsky.app/profile/${args.handle}/post/${rkey}`, uri: out.uri, cid: out.cid };
}
