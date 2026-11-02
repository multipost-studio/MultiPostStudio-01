/**
 * Which Graph host an Instagram/Facebook account talks to. Accounts connected with "Instagram Login" hold an Instagram
 * token (`metadata.igLogin`), which graph.facebook.com rejects; Facebook-Login accounts hold a Page token, which
 * graph.instagram.com rejects. The account decides, not the env, so both kinds can live side by side.
 */
export const FACEBOOK_GRAPH = "https://graph.facebook.com/v21.0";
export const INSTAGRAM_LOGIN_GRAPH = "https://graph.instagram.com/v21.0";

export function usesInstagramLogin(platform: string, metadata: string | null | undefined): boolean {
  if (platform !== "instagram" || !metadata) return false;
  try {
    return (JSON.parse(metadata) as { igLogin?: unknown } | null)?.igLogin === true;
  } catch {
    return false;
  }
}

export function metaGraphBase(platform: string, metadata: string | null | undefined): string {
  return usesInstagramLogin(platform, metadata) ? INSTAGRAM_LOGIN_GRAPH : FACEBOOK_GRAPH;
}
