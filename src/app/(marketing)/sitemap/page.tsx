import type { Metadata } from "next";
import Link from "next/link";
import { getAllNavLinks } from "@/lib/cms";
import { getSiteIndex, type IndexLink } from "@/lib/site-index";
import { Breadcrumbs } from "../_components";
import { ArticleBackdrop } from "../_hero-fx";

export const metadata: Metadata = {
  title: "Sitemap",
  description: "Every page on MultiPost Studio in one place: features, solutions, platforms, comparisons, tools, guides and policies.",
  alternates: { canonical: "/sitemap" },
};

// Reads live content (including admin edits), refreshed every ten minutes like sitemap.xml.
export const revalidate = 600;

type Group = { title: string; links: IndexLink[] };

export default async function SitemapPage() {
  const [nav, index] = await Promise.all([getAllNavLinks(), getSiteIndex()]);
  const groups: Group[] = [
    {
      title: "Start here",
      links: [
        { label: "Home", href: "/" },
        { label: "Pricing", href: "/pricing" },
        { label: "Start free", href: "/signup" },
        { label: "Sign in", href: "/login" },
      ],
    },
    { title: "Product", links: nav.product },
    { title: "Features", links: index.features },
    { title: "Solutions", links: index.solutions },
    { title: "Use cases", links: index.usecases },
    { title: "Platforms", links: index.platforms },
    { title: "Compare", links: index.compare },
    { title: "Free tools", links: index.tools },
    { title: "Guides", links: index.guides },
    { title: "Resources", links: nav.resource },
    { title: "Company", links: nav.company },
    { title: "Legal", links: [...nav.legal, { label: "Affiliate terms", href: "/legal/affiliate-terms" }, { label: "Data deletion", href: "/legal/data-deletion" }] },
  ];

  return (
    <main className="relative isolate">
      <ArticleBackdrop />
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Sitemap", path: "/sitemap" }]} />
        <h1 className="mt-4 text-[34px] font-extrabold leading-tight tracking-tight text-[var(--text)] sm:text-[44px]">Sitemap</h1>
        <p className="mt-2 max-w-2xl text-[16px] text-[var(--text-muted)]">Every public page in one place. Looking for the XML version for search engines? It&apos;s at <Link href="/sitemap.xml" className="font-medium text-[var(--primary)] hover:underline">/sitemap.xml</Link>.</p>

        <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <section key={g.title} aria-labelledby={`sm-${g.title}`}>
              <h2 id={`sm-${g.title}`} className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">{g.title}</h2>
              <ul className="mt-3 space-y-2">
                {g.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="text-[15px] text-[var(--text)] hover:text-[var(--primary)] hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
