import { env } from "@/lib/env";

/**
 * Unsplash stock-photo search. One app-level access key (no per-user OAuth).
 * Per the API guidelines a picked photo's `downloadLocation` MUST be pinged
 * before use, and the photographer must be credited.
 */
const API = "https://api.unsplash.com";

export type UnsplashPhoto = {
  id: string;
  thumb: string;
  small: string;
  regular: string;
  alt: string;
  creditName: string;
  creditUrl: string;
  downloadLocation: string;
};

function headers() {
  if (!env.UNSPLASH_ACCESS_KEY) throw new Error("Unsplash isn't configured");
  return { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" };
}

// SSRF guard: the client picks which photo to import and supplies its urls
// back to the server (importUnsplashAction). Those urls must only ever be
// fetched if they actually point at Unsplash's own hosts — otherwise a
// caller could make the server fetch an arbitrary internal/private URL.
const ALLOWED_HOSTS = new Set(["images.unsplash.com", "api.unsplash.com", "plus.unsplash.com"]);

export function isUnsplashUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

type RawPhoto = {
  id: string;
  urls: { thumb: string; small: string; regular: string };
  alt_description: string | null;
  description: string | null;
  user: { name: string; links: { html: string } };
  links: { download_location: string };
};

export async function searchUnsplash(
  query: string,
  page = 1,
): Promise<{ results: UnsplashPhoto[]; totalPages: number }> {
  const q = query.trim();
  if (!q) return { results: [], totalPages: 0 };
  const url = `${API}/search/photos?query=${encodeURIComponent(q)}&per_page=24&page=${Math.max(1, page)}&content_filter=high`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Unsplash search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { results: RawPhoto[]; total_pages: number };
  return {
    totalPages: j.total_pages,
    results: (j.results ?? []).map((p) => ({
      id: p.id,
      thumb: p.urls.thumb,
      small: p.urls.small,
      regular: p.urls.regular,
      alt: p.alt_description ?? p.description ?? "Unsplash photo",
      creditName: p.user.name,
      creditUrl: p.user.links.html,
      downloadLocation: p.links.download_location,
    })),
  };
}

/** Required by the Unsplash API terms whenever a photo is actually used. */
export async function triggerUnsplashDownload(downloadLocation: string): Promise<void> {
  if (!isUnsplashUrl(downloadLocation)) return; // refuse to fetch a non-Unsplash url
  try {
    await fetch(downloadLocation, { headers: headers() });
  } catch {
    // non-fatal — the import still succeeds
  }
}
