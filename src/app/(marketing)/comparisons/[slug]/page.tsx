import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Hero, Section, FAQ, CTA, Breadcrumbs, CheckList } from "../../_components";
import { Reveal } from "@/components/motion";
import { appUrl } from "@/lib/env";
import { LAST_VERIFIED, getComparison } from "../_comparison-data";
import { KeyTakeaways, RelatedGrid } from "../../_seo";

export async function generateStaticParams() {
  const { COMPARISON_SLUGS } = await import("../_comparison-data");
  return COMPARISON_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = getComparison(slug);
  const baseUrl = appUrl().replace(/\/$/, "");
  if (!c) return { title: "Comparison" };
  const title = `MultiPost Studio vs ${c.competitor} | MultiPost Studio`;
  const description = c.answer;
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/comparisons/${c.slug}` },
    openGraph: { title, description, url: `${baseUrl}/comparisons/${c.slug}`, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ComparisonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getComparison(slug);
  if (!c) notFound();

  return (
    <main>
      <Breadcrumbs
        items={[{ name: "Comparisons", path: "/comparisons" }, { name: `vs ${c.competitor}`, path: `/comparisons/${c.slug}` }]}
      />
      <Hero
        eyebrow="Comparison"
        title={`MultiPost Studio vs ${c.competitor}`}
        subtitle={c.tagline}
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "Compare plans", href: "/pricing" }}
      />

      <Section narrow>
        <KeyTakeaways
          points={[
            c.answer,
            c.pricingNote,
            `Competitor facts last verified ${LAST_VERIFIED} against public vendor documentation. Prices change — confirm before buying.`,
          ]}
        />
      </Section>

      <Section narrow>
        <Reveal>
          <h2 className="text-[1.6rem] font-extrabold tracking-[-0.02em] text-[var(--text)] sm:text-[2rem]">
            How they differ
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-muted)]">{c.positioning}</p>
        </Reveal>
        <Reveal delay={0.08} className="mt-6">
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]">
            <table className="w-full min-w-[560px] border-collapse bg-[var(--surface)] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-sunken)]">
                  <th className="px-4 py-3 font-bold text-[var(--text)]">Capability</th>
                  <th className="px-4 py-3 font-bold text-[var(--text)]">MultiPost Studio</th>
                  <th className="px-4 py-3 font-bold text-[var(--text)]">{c.competitor}</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.feature} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-[var(--text)]">{r.feature}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{r.multipost}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{r.competitor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
            Last verified {LAST_VERIFIED}. Pricing and features are based on publicly available documentation.
          </p>
        </Reveal>
      </Section>

      <Section bleed tone="rose">
        <div className="grid gap-8 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-[1.4rem] font-extrabold tracking-[-0.02em] text-[var(--text)]">
              Choose MultiPost Studio if
            </h2>
            <CheckList items={c.multiPostFit} className="mt-4" />
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="text-[1.4rem] font-extrabold tracking-[-0.02em] text-[var(--text)]">
              Choose {c.competitor} if
            </h2>
            <CheckList items={c.competitorFit} className="mt-4" />
          </Reveal>
        </div>
      </Section>

      <Section bleed tone="mint" title="Questions" narrow>
        <FAQ items={c.faqs} />
        <Reveal className="mt-6 border-t border-[var(--border)] pt-4">
          <p className="text-[12px] leading-relaxed text-[var(--text-subtle)]">
            Disclaimer: All trademarks, logos, and brand names are the property of their respective owners. Company, product, and service names used on this page are for identification purposes only. Pricing and feature details are gathered from publicly available documentation as of {LAST_VERIFIED} and are subject to change.
          </p>
        </Reveal>
      </Section>

      <Section title="Keep comparing" narrow>
        <RelatedGrid
          items={[
            ...["buffer", "hootsuite"]
              .filter((s) => s !== c.slug)
              .map((s) => ({
                href: `/comparisons/${s}`,
                title: `MultiPost Studio vs ${s === "buffer" ? "Buffer" : "Hootsuite"}`,
                body: "Pricing model, approvals and who each tool fits.",
              })),
            { href: "/pricing", title: "MultiPost Studio pricing", body: "Flat workspace plans from $0." },
            { href: "/features", title: "All features", body: "Every stage of social in one workspace." },
          ]}
        />
      </Section>

      <CTA
        title={`Try the ${c.competitor} alternative free`}
        body="Three channels, basic analytics and AI credits — no card, no trial clock."
      />
    </main>
  );
}
