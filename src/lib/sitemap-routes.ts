/** One XML sitemap entry. */
export type SitemapRoute = { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" };

/**
 * Drops repeated paths (a hand-kept list and a generated one can name the same
 * page), keeping the first position and the highest priority seen, and normalises
 * a trailing slash so "/about" and "/about/" are one entry.
 */
export function dedupeRoutes<T extends SitemapRoute>(routes: T[]): T[] {
  const norm = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);
  const seen = new Map<string, T>();
  for (const r of routes) {
    const path = norm(r.path);
    const prev = seen.get(path);
    if (!prev) seen.set(path, { ...r, path });
    else if (r.priority > prev.priority) seen.set(path, { ...prev, priority: r.priority });
  }
  return [...seen.values()];
}
