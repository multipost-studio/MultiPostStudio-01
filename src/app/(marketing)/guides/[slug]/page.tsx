import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, Prose, CTA } from "../../_components";
import { Reveal } from "@/components/motion";
import { getGuides, getGuide } from "@/lib/cms";

export async function generateStaticParams() {
  return (await getGuides()).map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = await getGuide(slug);
  return { title: g ? g.title : "Guide" };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await getGuide(slug);
  if (!g) notFound();

  return (
    <main>
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
            <p>
              Most social work fails not for lack of effort but for lack of a repeatable system. This guide
              gives you one you can run every week without re-deciding everything.
            </p>
            <h2>The framework</h2>
            <ul>
              <li>Start from the outcome you want, not the format.</li>
              <li>Pick a small set of pillars and hold them for a quarter.</li>
              <li>Batch production; let the queue handle timing.</li>
              <li>Review the trend line monthly and adjust one thing.</li>
            </ul>
            <h2>Doing it in MultiPost Studio</h2>
            <p>
              Set your pillars in workspace settings, capture ideas on the board, generate drafts in AI Studio,
              and let the queue publish. The health score tells you when to course-correct.
            </p>
          </Prose>
        </div>
      </Section>
      <CTA />
    </main>
  );
}
