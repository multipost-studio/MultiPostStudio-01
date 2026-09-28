import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, Prose, CTA, Breadcrumbs } from "../../_components";
import { Reveal } from "@/components/motion";
import { getGuides, getGuide } from "@/lib/cms";

export async function generateStaticParams() {
  return (await getGuides()).map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = await getGuide(slug);
  return { title: g ? g.title : "Guide", description: g?.summary };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await getGuide(slug);
  if (!g) notFound();

  return (
    <main>
      <Breadcrumbs items={[{ name: "Guides", path: "/guides" }, { name: g.title, path: `/guides/${slug}` }]} />
      <Section narrow>
        <Reveal>
          <Link href="/guides" className="text-[14px] text-[var(--text-muted)] hover:underline">
            ← All guides
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text)]">{g.title}</h1>
          <p className="mt-2 text-[14px] text-[var(--text-subtle)]">{g.minutes} min read</p>
        </Reveal>
        <div className="mt-8">
          <Prose>
            <p>{g.summary}</p>
            <h2>Why it matters</h2>
            <p>{g.whyItMatters}</p>
            <h2>The framework</h2>
            <ul>
              {g.framework.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ul>
            <h2>Doing it in MultiPost Studio</h2>
            <p>{g.inMultiPostStudio}</p>
          </Prose>
        </div>
      </Section>
      <CTA />
    </main>
  );
}
