import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Hero, Section, Prose } from "../../_components";
import { Button } from "@/components/ui/button";
import { getJobs, getJob } from "@/lib/cms";

export async function generateStaticParams() {
  return (await getJobs()).map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const j = await getJob(slug);
  return { title: j ? j.title : "Role" };
}

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job) notFound();

  return (
    <main>
      <Hero eyebrow={`${job.team} · ${job.location}`} title={job.title} subtitle={`${job.type} · Remote`} />
      <Section narrow>
        <Prose>
          <h2>About the role</h2>
          <p>
            You&apos;ll own a meaningful surface of MultiPost Studio end to end — from the problem statement through
            design, implementation, rollout and iteration. Our teams are small and cross-functional; there is
            no throwing work over a wall.
          </p>
          <h2>What you&apos;ll do</h2>
          <ul>
            <li>Ship user-facing improvements every week and watch how they land.</li>
            <li>Write clear proposals; disagree well; commit once decided.</li>
            <li>Keep the bar high on reliability, accessibility and performance.</li>
            <li>Talk to customers regularly — the best ideas come from that.</li>
          </ul>
          <h2>What we look for</h2>
          <ul>
            <li>A track record of shipping, not just planning.</li>
            <li>Comfort with ambiguity and a bias toward the simplest thing that works.</li>
            <li>Strong written communication — we&apos;re async-first.</li>
          </ul>
          <h2>Compensation</h2>
          <p>
            Transparent bands, real equity, and the same offer regardless of where you live. Details shared
            in the first call.
          </p>
        </Prose>
        <div className="mx-auto mt-8 max-w-2xl">
          <Button asChild>
            <Link href={`/contact?role=${job.slug}`}>Apply for this role</Link>
          </Button>
          <Link href="/careers" className="ml-3 text-[14px] text-[var(--text-muted)] hover:underline">
            ← All roles
          </Link>
        </div>
      </Section>
    </main>
  );
}
