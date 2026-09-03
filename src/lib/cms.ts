import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { BLOG_POSTS, CHANGELOG, CUSTOMERS } from "@/app/(marketing)/_data";

/**
 * Admin-editable marketing content. Rows live in CmsEntry (data = JSON keyed by
 * collection). Each getter returns DB rows when present, else the seed arrays
 * from _data.ts — so a fresh DB still renders, and `npm run db:seed` populates
 * editable copies. Cached in-process for 30s; admin edits call `invalidateCms()`.
 */

export type BlogPost = (typeof BLOG_POSTS)[number];
export type ChangelogEntry = (typeof CHANGELOG)[number];
export type CustomerEntry = (typeof CUSTOMERS)[number];
export type FaqItem = { q: string; a: string };

const cache = new Map<string, { at: number; rows: { slug: string; data: unknown }[] }>();
const TTL_MS = 30_000;

async function read(collection: string): Promise<{ slug: string; data: unknown }[]> {
  const hit = cache.get(collection);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  try {
    const rows = await db.cmsEntry.findMany({
      where: { collection, published: true },
      orderBy: { sortIndex: "asc" },
    });
    const mapped = rows.map((r) => ({ slug: r.slug, data: parseJson<unknown>(r.data, {}) }));
    cache.set(collection, { at: Date.now(), rows: mapped });
    return mapped;
  } catch {
    return [];
  }
}

export function invalidateCms(collection?: string) {
  if (collection) cache.delete(collection);
  else cache.clear();
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const rows = await read("blog");
  return rows.length ? (rows.map((r) => r.data) as BlogPost[]) : [...BLOG_POSTS];
}

export async function getBlogPost(slug: string): Promise<BlogPost | undefined> {
  return (await getBlogPosts()).find((p) => p.slug === slug);
}

export async function getChangelog(): Promise<ChangelogEntry[]> {
  const rows = await read("changelog");
  return rows.length ? (rows.map((r) => r.data) as ChangelogEntry[]) : [...CHANGELOG];
}

export async function getCustomers(): Promise<CustomerEntry[]> {
  const rows = await read("customer");
  return rows.length ? (rows.map((r) => r.data) as CustomerEntry[]) : [...CUSTOMERS];
}

/** FAQ items for a page. `data` shape: { page: string, q: string, a: string }. */
export async function getFaqs(page: string, seed: FaqItem[]): Promise<FaqItem[]> {
  const rows = await read("faq");
  const forPage = rows
    .map((r) => r.data as { page?: string; q?: string; a?: string })
    .filter((d) => d.page === page && d.q && d.a)
    .map((d) => ({ q: d.q!, a: d.a! }));
  return forPage.length ? forPage : seed;
}

export const CMS_COLLECTIONS = ["blog", "changelog", "customer", "faq"] as const;
export type CmsCollection = (typeof CMS_COLLECTIONS)[number];
