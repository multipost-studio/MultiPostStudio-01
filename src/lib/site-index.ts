import { getCustomers, getFeaturePages, getGuides, getSolutionPages } from "@/lib/cms";
import { PLATFORMS } from "@/lib/constants";
import { PLATFORM_SEO } from "@/app/(marketing)/platforms/_platform-data";
import { COMPARISONS } from "@/app/(marketing)/comparisons/_comparison-data";

/**
 * One index of the site's public pages, grouped the way visitors think about them.
 * The footer columns, the HTML sitemap and the XML sitemap all read from here, so a
 * new platform, comparison, guide or use case shows up in all three at once instead
 * of three hand-kept lists drifting apart.
 */

export type IndexLink = { label: string; href: string };

export type SiteIndex = {
  features: IndexLink[];
  solutions: IndexLink[];
  usecases: IndexLink[];
  platforms: IndexLink[];
  compare: IndexLink[];
  tools: IndexLink[];
  guides: IndexLink[];
};

/** The free tools. Kept next to the index so the footer, sitemaps and tools page agree on what exists. */
export const FREE_TOOLS: IndexLink[] = [
  { label: "Caption generator", href: "/tools/caption-generator" },
  { label: "Hashtag generator", href: "/tools/hashtag-generator" },
  { label: "Best-time calculator", href: "/tools/best-time" },
  { label: "Character counter", href: "/tools/character-counter" },
  { label: "Engagement-rate calculator", href: "/tools/engagement-rate" },
];

type Named = { name: string };
type Guide = { slug: string; title: string };
type Customer = { slug: string; name: string };

/** Pure: turns raw content into link lists. Each list opens with its overview page. */
export function buildSiteIndex(input: {
  features: Record<string, Named>;
  solutions: Record<string, Named>;
  customers: Customer[];
  guides: Guide[];
  platforms: { slug: string; key: keyof typeof PLATFORMS }[];
  comparisons: { slug: string; competitor: string }[];
}): SiteIndex {
  return {
    features: [{ label: "All features", href: "/features" }, ...Object.entries(input.features).map(([slug, f]) => ({ label: f.name, href: `/features/${slug}` }))],
    solutions: [{ label: "All solutions", href: "/solutions" }, ...Object.entries(input.solutions).map(([slug, s]) => ({ label: s.name, href: `/solutions/${slug}` }))],
    usecases: [{ label: "All use cases", href: "/customers" }, ...input.customers.map((c) => ({ label: c.name, href: `/customers/${c.slug}` }))],
    platforms: [{ label: "All platforms", href: "/platforms" }, ...input.platforms.map((p) => ({ label: PLATFORMS[p.key]?.label ?? p.slug, href: `/platforms/${p.slug}` }))],
    compare: [{ label: "All comparisons", href: "/comparisons" }, ...input.comparisons.map((c) => ({ label: `vs ${c.competitor}`, href: `/comparisons/${c.slug}` }))],
    tools: [{ label: "All free tools", href: "/tools" }, ...FREE_TOOLS],
    guides: [{ label: "All guides", href: "/guides" }, ...input.guides.map((g) => ({ label: g.title, href: `/guides/${g.slug}` }))],
  };
}

/** Live index: CMS content (admin edits included) plus the static platform and comparison data. */
export async function getSiteIndex(): Promise<SiteIndex> {
  const [features, solutions, customers, guides] = await Promise.all([getFeaturePages(), getSolutionPages(), getCustomers(), getGuides()]);
  return buildSiteIndex({
    features,
    solutions,
    customers,
    guides,
    platforms: PLATFORM_SEO,
    comparisons: COMPARISONS,
  });
}
