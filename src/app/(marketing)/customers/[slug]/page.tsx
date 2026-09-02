import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, Prose, CTA } from "../../_components";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { CUSTOMERS } from "../../_data";

export function generateStaticParams() {
  return CUSTOMERS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = CUSTOMERS.find((x) => x.slug === slug);
  return { title: c ? `${c.name} — customer story` : "Customer story" };
}

export default async function CustomerStoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = CUSTOMERS.find((x) => x.slug === slug);
  if (!c) notFound();

  return (
    <main>
      <Section narrow>
        <Reveal>
          <Link href="/customers" className="text-[14px] text-[var(--text-muted)] hover:underline">
            ← All stories
          </Link>
          <div className="mt-4 flex items-center gap-2">
            <Badge tone="neutral">{c.industry}</Badge>
            <Badge tone="primary">{c.result}</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text)]">{c.name}</h1>
          <p className="mt-3 border-l-2 border-[var(--primary)] pl-4 text-[17px] italic text-[var(--text-muted)]">
            &ldquo;{c.quote}&rdquo; — {c.person}
          </p>
        </Reveal>
        <div className="mt-8">
          <Prose>
            <h2>The challenge</h2>
            <p>
              Before MultiPost Studio, {c.name} juggled scheduling, approvals and reporting across separate tools and
              spreadsheets. Work fell through the seams, and nobody trusted the calendar.
            </p>
            <h2>What changed</h2>
            <ul>
              <li>One workspace for ideation through analytics.</li>
              <li>Approval chains with a locked audit trail.</li>
              <li>AI Studio + Brand Brain to draft faster without sounding generic.</li>
              <li>A health score that flags when cadence slips.</li>
            </ul>
            <h2>The result</h2>
            <p>
              {c.result}. Just as important, the team stopped dreading the parts of social that used to take
              all week.
            </p>
          </Prose>
        </div>
      </Section>
      <CTA />
    </main>
  );
}
