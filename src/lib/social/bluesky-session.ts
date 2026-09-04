import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { encryptToken, decryptToken, readToken } from "./crypto";
import { blueskyRefresh } from "./bluesky";

/**
 * Run a Bluesky API call with a live session. The stored access JWT lasts ~2h;
 * on an expired-token failure this refreshes it via the (~90d) refresh JWT,
 * persists the new pair, and retries the call once.
 *
 * Both the publish path and the background syncs go through here so token
 * refresh happens in exactly one place.
 */
type BskyAccount = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  metadata: string | null;
};

const EXPIRED = /\b401\b|ExpiredToken|Token has expired|InvalidToken/i;

export async function runWithBluesky<T>(
  account: BskyAccount,
  run: (accessJwt: string, pds: string | undefined) => Promise<T>,
): Promise<T> {
  const access = readToken(account.accessToken);
  if (!access) throw new Error("Bluesky access token unavailable — reconnect");
  const { pds } = parseJson<{ pds?: string }>(account.metadata, {});

  try {
    return await run(access, pds);
  } catch (e) {
    if (!EXPIRED.test(String(e)) || !account.refreshToken) throw e;

    const s = await blueskyRefresh(decryptToken(account.refreshToken), pds);
    await db.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encryptToken(s.accessJwt),
        refreshToken: encryptToken(s.refreshJwt),
        status: "connected",
      },
    });
    return await run(s.accessJwt, pds);
  }
}
