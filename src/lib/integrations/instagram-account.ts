/**
 * Facts about the connected Instagram account that the composer shows. Read live from Instagram, never guessed: when Instagram does
 * not answer, the answer is null and the composer says nothing rather than inventing a number.
 */

/** The account's follower count, or null when Instagram doesn't give it. `base` is the account's own Graph host. */
export async function fetchFollowersCount(base: string, token: string, igUserId: string): Promise<number | null> {
  try {
    const res = await fetch(`${base}/${encodeURIComponent(igUserId)}?fields=followers_count&access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const n = Number(((await res.json()) as { followers_count?: unknown }).followers_count);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  } catch {
    return null;
  }
}
