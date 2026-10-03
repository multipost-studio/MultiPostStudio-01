import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, Prose, CTA, Breadcrumbs } from "../../_components";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { getCustomers } from "@/lib/cms";
import { appUrl } from "@/lib/env";

export async function generateStaticParams() {
  return (await getCustomers()).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = (await getCustomers()).find((x) => x.slug === slug);
  const baseUrl = appUrl().replace(/\/$/, "");
  return {
    title: c ? `${c.name} — Workflow Playbook` : "Workflow playbook",
    description: c ? `How teams doing ${c.name.toLowerCase()} use MultiPost Studio. ${c.result}.` : "A MultiPost Studio workflow playbook.",
    alternates: { canonical: c ? `${baseUrl}/customers/${slug}` : undefined },
  };
}

export default async function CustomerStoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = (await getCustomers()).find((x) => x.slug === slug);
  if (!c) notFound();

  return (
    <main>
      <Breadcrumbs items={[{ name: "Use cases", path: "/customers" }, { name: c.name, path: `/customers/${slug}` }]} />
      <Section narrow>
        <Reveal>
          <Link href="/customers" className="text-[14px] text-[var(--text-muted)] hover:underline">
            ← All workflow playbooks
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{c.industry}</Badge>
            <Badge tone="neutral">Illustrative example</Badge>
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
              Before standardizing on MultiPost Studio, teams managing this workflow juggled scheduling, approvals and reporting across disconnected point solutions and spreadsheets. Posts slipped past deadlines, and review handoffs broke down.
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
