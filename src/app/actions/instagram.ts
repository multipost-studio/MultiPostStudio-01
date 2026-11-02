"use server";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { refreshIfNeeded } from "@/lib/social/oauth";
import { usesInstagramLogin } from "@/lib/social/meta-host";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  InstagramSearchError,
  searchInstagramLocations,
  searchInstagramMusic,
  SEARCH_QUERY_MAX,
  type LocationChoice,
  type MusicChoice,
} from "@/lib/integrations/instagram-search";
import { parseJson } from "@/lib/utils";
import { withPermission, ensureInWorkspace, ok, fail } from "./_helpers";

/**
 * Music and location lookups for the Instagram options in the composer. Both need an account connected through Facebook
 * (Meta doesn't offer them on Instagram Login). Every call checks the account is in the caller's workspace and is rate limited.
 */

const RECONNECT = "Music and location need this account connected through Facebook. Reconnect it in Integrations and choose “Connect through Facebook”.";

async function facebookConnectedAccount(accountId: unknown, workspaceId: string) {
  if (typeof accountId !== "string" || !accountId) return { account: null, error: "Invalid request" } as const;
  await ensureInWorkspace("socialAccount", accountId, workspaceId);
  const account = await db.socialAccount.findUnique({
    where: { id: accountId },
    select: { id: true, platform: true, metadata: true, status: true },
  });
  if (!account || account.platform !== "instagram") return { account: null, error: "Instagram account not found in this workspace" } as const;
  if (usesInstagramLogin(account.platform, account.metadata)) return { account: null, error: RECONNECT } as const;
  return { account, error: null } as const;
}

function explain(err: unknown, what: "music" | "locations"): string {
  if (err instanceof InstagramSearchError) {
    if (err.kind === "permission") {
      return what === "music"
        ? "Instagram didn't allow a music search for this account. Reconnect it through Facebook, or check that your Meta app has access to the Instagram Audio API."
        : "Instagram didn't allow a location search. Your Meta app may need “Page Public Metadata Access”. You can still paste a location Page ID.";
    }
    if (err.kind === "unavailable") return "Instagram isn't answering right now. Try again in a moment.";
  }
  return `Couldn't search ${what} right now.`;
}

export async function searchInstagramMusicAction(accountId: string, query: string) {
  const ctx = await withPermission("content.create");
  const q = typeof query === "string" ? query.trim().slice(0, SEARCH_QUERY_MAX) : "";
  try {
    const found = await facebookConnectedAccount(accountId, ctx.active.workspace.id);
    if (!found.account) return fail(found.error);
    const { account } = found;
    try {
      await enforceRateLimit(`ig-music:${account.id}`, 30, 60_000);
    } catch (e) {
      if (e instanceof RateLimitError) return fail("Too many searches. Try again in a minute.");
      throw e;
    }
    const igId = parseJson<{ remoteId?: string }>(account.metadata, {}).remoteId;
    if (!igId) return fail("This Instagram account needs to be reconnected.");
    const token = await refreshIfNeeded(account.id);
    if (!token) return fail("Instagram authorization expired. Reconnect the account in Integrations.");
    return ok<{ tracks: MusicChoice[] }>({ tracks: await searchInstagramMusic(token, igId, q) });
  } catch (err) {
    logger.warn({ err, accountId }, "instagram music search failed");
    return fail(explain(err, "music"));
  }
}

export async function searchInstagramLocationsAction(accountId: string, query: string) {
  const ctx = await withPermission("content.create");
  const q = typeof query === "string" ? query.trim().slice(0, SEARCH_QUERY_MAX) : "";
  if (q.length < 2) return ok<{ places: LocationChoice[] }>({ places: [] });
  try {
    const found = await facebookConnectedAccount(accountId, ctx.active.workspace.id);
    if (!found.account) return fail(found.error);
    const { account } = found;
    try {
      await enforceRateLimit(`ig-places:${account.id}`, 30, 60_000);
    } catch (e) {
      if (e instanceof RateLimitError) return fail("Too many searches. Try again in a minute.");
      throw e;
    }
    const token = await refreshIfNeeded(account.id);
    if (!token) return fail("Instagram authorization expired. Reconnect the account in Integrations.");
    return ok<{ places: LocationChoice[] }>({ places: await searchInstagramLocations(token, q) });
  } catch (err) {
    logger.warn({ err, accountId }, "instagram location search failed");
    return fail(explain(err, "locations"));
  }
}
