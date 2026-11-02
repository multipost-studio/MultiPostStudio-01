/**
 * Instagram music and location lookups for the composer. Both need an account connected through Facebook Login: Meta's Audio
 * API is not offered on Instagram Login, and a location is a Facebook Page that has a location.
 *
 * Written from Meta's documentation (Instagram Audio API, IG User Media `location_id`); not yet run against a live account.
 * Responses are mapped defensively: anything unexpected is dropped rather than thrown on.
 */

const AUDIO_GRAPH = "https://graph.facebook.com/v22.0";
const PAGES_GRAPH = "https://graph.facebook.com/v21.0";

export const MUSIC_RESULTS_MAX = 25;
export const LOCATION_RESULTS_MAX = 10;
export const SEARCH_QUERY_MAX = 100;

export type MusicChoice = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  durationMs: number;
  /** A temporary link for a preview, when Instagram supplied one. */
  previewUrl: string;
};

export type LocationChoice = { id: string; name: string; place: string };

const httpsUrl = (u: unknown): string => {
  if (typeof u !== "string") return "";
  try {
    return new URL(u).protocol === "https:" ? u : "";
  } catch {
    return "";
  }
};
const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");

export class InstagramSearchError extends Error {
  constructor(
    public kind: "permission" | "unavailable" | "bad-request",
    message: string,
  ) {
    super(message);
    this.name = "InstagramSearchError";
  }
}

async function graphGet(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new InstagramSearchError("unavailable", "Instagram didn't answer in time.");
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    // OAuthException / code 10 / 200-series: missing permission or feature approval. 4xx otherwise.
    const permission = res.status === 401 || res.status === 403 || /"code"\s*:\s*(10|190|200|2\d\d)\b|permission|OAuthException/i.test(text);
    throw new InstagramSearchError(permission ? "permission" : res.status >= 500 ? "unavailable" : "bad-request", `Graph ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new InstagramSearchError("unavailable", "Instagram sent an unreadable answer.");
  }
}

/** Trending music when `query` is empty, otherwise a search. Only tracks Instagram authorized for third-party use come back. */
export async function searchInstagramMusic(token: string, igUserId: string, query: string): Promise<MusicChoice[]> {
  const q = query.trim().slice(0, SEARCH_QUERY_MAX);
  const url =
    `${AUDIO_GRAPH}/ig_audio?audio_type=music&user_id=${encodeURIComponent(igUserId)}` +
    (q ? `&search_query=${encodeURIComponent(q)}` : "") +
    `&access_token=${encodeURIComponent(token)}`;
  const body = (await graphGet(url)) as { audio?: unknown };
  const rows = Array.isArray(body?.audio) ? (body.audio as Record<string, unknown>[]) : [];
  const out: MusicChoice[] = [];
  for (const r of rows) {
    const id = typeof r?.audio_id === "string" || typeof r?.audio_id === "number" ? String(r.audio_id) : "";
    if (!/^[0-9]{1,30}$/.test(id)) continue;
    const title = str(r.title);
    if (!title) continue;
    out.push({
      id,
      title,
      artist: str(r.display_artist),
      cover: httpsUrl(r.cover_artwork_thumbnail_uri ?? r.cover_artwork_thumbnail_url),
      durationMs: Number.isFinite(Number(r.duration_in_ms)) ? Math.max(0, Math.round(Number(r.duration_in_ms))) : 0,
      previewUrl: httpsUrl(r.download_url ?? r.on_platform_audio_preview_link),
    });
    if (out.length >= MUSIC_RESULTS_MAX) break;
  }
  return out;
}

/** Facebook Pages whose name matches and that have a location, which is what Instagram accepts as a location tag. */
export async function searchInstagramLocations(token: string, query: string): Promise<LocationChoice[]> {
  const q = query.trim().slice(0, SEARCH_QUERY_MAX);
  if (q.length < 2) return [];
  const url =
    `${PAGES_GRAPH}/pages/search?q=${encodeURIComponent(q)}&fields=id,name,location` +
    `&limit=${LOCATION_RESULTS_MAX * 2}&access_token=${encodeURIComponent(token)}`;
  const body = (await graphGet(url)) as { data?: unknown };
  const rows = Array.isArray(body?.data) ? (body.data as Record<string, unknown>[]) : [];
  const out: LocationChoice[] = [];
  for (const r of rows) {
    const id = typeof r?.id === "string" ? r.id : "";
    const loc = r?.location && typeof r.location === "object" ? (r.location as Record<string, unknown>) : null;
    if (!/^[0-9]{1,30}$/.test(id) || !loc) continue; // a Page without location data is rejected by Instagram
    const name = str(r.name);
    if (!name) continue;
    const place = [str(loc.city, 80), str(loc.state, 80), str(loc.country, 80)].filter(Boolean).join(", ");
    out.push({ id, name, place });
    if (out.length >= LOCATION_RESULTS_MAX) break;
  }
  return out;
}
