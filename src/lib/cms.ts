import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import {
  BLOG_POSTS,
  CHANGELOG,
  CUSTOMERS,
  FEATURE_PAGES,
  SOLUTION_PAGES,
  GUIDES,
  JOBS,
  ROADMAP,
  PRODUCT_LINKS,
  SOLUTION_LINKS,
  RESOURCE_LINKS,
  COMPANY_LINKS,
  LEGAL_LINKS,
} from "@/app/(marketing)/_data";

/**
 * Admin-editable marketing content. Rows live in CmsEntry (data = JSON keyed by
 * collection). Each getter returns DB rows when present, else the seed data
 * from _data.ts — so a fresh DB still renders and `npm run seed:cms` populates
 * editable copies. Cached in-process for 30s; admin edits call `invalidateCms()`.
 */

export type BlogPost = (typeof BLOG_POSTS)[number];
export type ChangelogEntry = (typeof CHANGELOG)[number];
export type CustomerEntry = (typeof CUSTOMERS)[number];
export type FeaturePage = (typeof FEATURE_PAGES)[string] & { slug: string };
export type SolutionPage = (typeof SOLUTION_PAGES)[string] & { slug: string };
export type GuideEntry = (typeof GUIDES)[number];
export type JobEntry = (typeof JOBS)[number];
export type RoadmapData = typeof ROADMAP;
export type NavLink = { label: string; href: string; desc?: string };
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

/* ---------- blog ---------- */
export async function getBlogPosts(): Promise<BlogPost[]> {
  const rows = await read("blog");
  return rows.length ? (rows.map((r) => r.data) as BlogPost[]) : [...BLOG_POSTS];
}
export async function getBlogPost(slug: string): Promise<BlogPost | undefined> {
  return (await getBlogPosts()).find((p) => p.slug === slug);
}

/* ---------- changelog ---------- */
export async function getChangelog(): Promise<ChangelogEntry[]> {
  const rows = await read("changelog");
  return rows.length ? (rows.map((r) => r.data) as ChangelogEntry[]) : [...CHANGELOG];
}

/* ---------- customers ---------- */
export async function getCustomers(): Promise<CustomerEntry[]> {
  const rows = await read("customer");
  return rows.length ? (rows.map((r) => r.data) as CustomerEntry[]) : [...CUSTOMERS];
}

/* ---------- feature pages ---------- */
export async function getFeaturePages(): Promise<Record<string, FeaturePage>> {
  const rows = await read("feature");
  if (!rows.length) {
    return Object.fromEntries(Object.entries(FEATURE_PAGES).map(([slug, v]) => [slug, { ...v, slug }]));
  }
  return Object.fromEntries(rows.map((r) => [r.slug, { ...(r.data as object), slug: r.slug } as FeaturePage]));
}
export async function getFeaturePage(slug: string): Promise<FeaturePage | undefined> {
  return (await getFeaturePages())[slug];
}

/* ---------- solution pages ---------- */
export async function getSolutionPages(): Promise<Record<string, SolutionPage>> {
  const rows = await read("solution");
  if (!rows.length) {
    return Object.fromEntries(Object.entries(SOLUTION_PAGES).map(([slug, v]) => [slug, { ...v, slug }]));
  }
  return Object.fromEntries(rows.map((r) => [r.slug, { ...(r.data as object), slug: r.slug } as SolutionPage]));
}
export async function getSolutionPage(slug: string): Promise<SolutionPage | undefined> {
  return (await getSolutionPages())[slug];
}

/* ---------- guides ---------- */
export async function getGuides(): Promise<GuideEntry[]> {
  const rows = await read("guide");
  return rows.length ? (rows.map((r) => r.data) as GuideEntry[]) : [...GUIDES];
}
export async function getGuide(slug: string): Promise<GuideEntry | undefined> {
  return (await getGuides()).find((g) => g.slug === slug);
}

/* ---------- jobs ---------- */
export async function getJobs(): Promise<JobEntry[]> {
  const rows = await read("job");
  return rows.length ? (rows.map((r) => r.data) as JobEntry[]) : [...JOBS];
}
export async function getJob(slug: string): Promise<JobEntry | undefined> {
  return (await getJobs()).find((j) => j.slug === slug);
}

/* ---------- roadmap (single entry, slug "roadmap") ---------- */
export async function getRoadmap(): Promise<RoadmapData> {
  const rows = await read("roadmap");
  const row = rows.find((r) => r.slug === "roadmap");
  return (row?.data as RoadmapData) ?? ROADMAP;
}

/* ---------- nav / footer link lists ---------- */
const NAV_SEED: Record<string, NavLink[]> = {
  product: PRODUCT_LINKS,
  solution: SOLUTION_LINKS,
  resource: RESOURCE_LINKS,
  company: COMPANY_LINKS,
  legal: LEGAL_LINKS,
};
export async function getNavLinks(key: keyof typeof NAV_SEED): Promise<NavLink[]> {
  const rows = await read("navlink");
  const row = rows.find((r) => r.slug === key);
  const items = (row?.data as { items?: NavLink[] })?.items;
  return items?.length ? items : NAV_SEED[key];
}
export async function getAllNavLinks() {
  const [product, solution, resource, company, legal] = await Promise.all([
    getNavLinks("product"),
    getNavLinks("solution"),
    getNavLinks("resource"),
    getNavLinks("company"),
    getNavLinks("legal"),
  ]);
  return { product, solution, resource, company, legal };
}

/* ---------- faq ---------- */
export async function getFaqs(page: string, seed: FaqItem[]): Promise<FaqItem[]> {
  const rows = await read("faq");
  const forPage = rows
    .map((r) => r.data as { page?: string; q?: string; a?: string })
    .filter((d) => d.page === page && d.q && d.a)
    .map((d) => ({ q: d.q!, a: d.a! }));
  return forPage.length ? forPage : seed;
}

export const CMS_COLLECTIONS = [
  "blog",
  "changelog",
  "customer",
  "feature",
  "solution",
  "guide",
  "job",
  "roadmap",
  "navlink",
  "faq",
] as const;
export type CmsCollection = (typeof CMS_COLLECTIONS)[number];
