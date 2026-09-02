import type { SocialAccount, SocialChannel } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/utils";
import { readToken, isRealToken, encryptToken, decryptToken } from "@/lib/social/crypto";
import { getProvider } from "@/lib/social/providers";
import { refreshIfNeeded } from "@/lib/social/oauth";
import { blueskyPost, blueskyRefresh } from "@/lib/social/bluesky";

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
): Promise<PublishResult> {
  switch (account.platform) {
    case "bluesky":
      return publishBluesky(account, channel, body);
    case "linkedin":
      return publishLinkedIn(account, body);
    case "facebook":
      return publishFacebook(account, body);
    case "x":
      return publishX(account, body);
    default:
      throw new PublishNotImplemented(account.platform);
  }
}

/* ---------------- Bluesky ---------------- */

async function publishBluesky(account: SocialAccount, channel: SocialChannel, text: string): Promise<PublishResult> {
  const meta = parseJson<{ did?: string; pds?: string }>(account.metadata, {});
  if (!meta.did) throw new Error("Bluesky account missing did — reconnect it");
  let accessJwt = readToken(account.accessToken);
  if (!accessJwt) throw new Error("Bluesky session missing");

  const handle = channel.handle.replace(/^@/, "");
  try {
    const r = await blueskyPost({ pds: meta.pds, accessJwt, did: meta.did, handle, text });
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
    const r = await blueskyPost({ pds: meta.pds, accessJwt, did: meta.did, handle, text });
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

/* ---------------- Facebook Page ---------------- */

async function publishFacebook(account: SocialAccount, message: string): Promise<PublishResult> {
  const token = await refreshIfNeeded(account.id);
  if (!token) throw new Error("Facebook token unavailable — reconnect");
  const meta = parseJson<{ remoteId?: string }>(account.metadata, {});
  if (!meta.remoteId) throw new Error("Facebook account missing Page id — reconnect");

  const res = await fetch(`https://graph.facebook.com/v21.0/${meta.remoteId}/feed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, access_token: token }),
  });
  if (!res.ok) throw new Error(`Facebook ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { id: string };
  return { remoteId: j.id, url: `https://www.facebook.com/${j.id}` };
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
