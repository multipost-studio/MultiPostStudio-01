import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarClock, Sparkles, Inbox, CheckCheck, BarChart3, Workflow,
} from "lucide-react";
import { Hero, Section, FeatureGrid, StepList, CheckList, FAQ, CTA } from "../../_components";
import { Reveal } from "@/components/motion";
import { MiniArea } from "../../_visuals";
import { SOLUTION_PAGES, SOLUTION_LINKS } from "../../_data";

export function generateStaticParams() {
  return Object.keys(SOLUTION_PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = SOLUTION_PAGES[slug];
  return {
    title: p ? p.name : "Solution",
    description: p?.intro,
  };
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = SOLUTION_PAGES[slug];
  if (!p) notFound();

  const others = SOLUTION_LINKS.filter((s) => s.href !== `/solutions/${slug}`);

  return (
    <main>
      <Hero
        eyebrow={`For ${p.name}`}
        title={p.tagline}
        subtitle={p.intro}
        primary={{ label: p.cta, href: "/signup" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
      />

      <Section title={`Why ${p.name.toLowerCase()} choose MultiPost Studio`}>
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <Reveal>
            <p className="text-[16px] font-medium leading-relaxed text-[var(--text-muted)]">
              {p.intro} Here&apos;s what that looks like day to day:
            </p>
            <CheckList items={p.bullets} className="mt-5" />
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">
                Cross-channel performance · last 30 days
              </p>
              <MiniArea />
              <p className="mt-3 text-[13.5px] font-medium leading-relaxed text-[var(--text-muted)]">
                AI Insights reads this the way a strategist would — then tells you the next move.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section bleed tone="rose" title="The workflow" narrow>
        <StepList
          steps={[
            { title: "Plan", body: "Capture ideas on the board, draft with AI in your voice, and lay out a week or month on one calendar." },
            { title: "Ship", body: "Approvals run their course, then per-channel queues publish each post at its best time — with retries if a platform hiccups." },
            { title: "Learn", body: "Engagement flows into one inbox; results roll up into reports and a health score that says exactly what to fix." },
          ]}
        />
      </Section>

      <Section title="What's included on every plan">
        <FeatureGrid
          items={[
            { icon: <CalendarClock size={17} />, title: "Smart calendar & queues", body: "Month/week/day/list views, drag-to-reschedule, fixed or AI-optimised timing.", href: "/features/publishing" },
            { icon: <Sparkles size={17} />, title: "AI Content Studio", body: "Hooks, captions, hashtags, platform variants — plus a pre-publish score.", href: "/features/ai-studio" },
            { icon: <Inbox size={17} />, title: "Community Hub", body: "One inbox for comments, DMs, mentions and reviews with AI replies.", href: "/features/engagement" },
            { icon: <CheckCheck size={17} />, title: "Approval workflows", body: "Multi-stage chains and an immutable audit trail.", href: "/solutions/agencies" },
            { icon: <BarChart3 size={17} />, title: "Analytics & AI Insights", body: "Cross-channel rollups, report builder, and what-to-do-next.", href: "/features/analytics" },
            { icon: <Workflow size={17} />, title: "Automation engine", body: "WHEN / THEN rules for the repetitive parts.", href: "/features" },
          ]}
        />
      </Section>

      <Section bleed tone="mint" title="Questions" narrow>
        <FAQ
          items={[
            { q: "Can I start free?", a: "Yes — the free plan needs no card. Upgrade when you connect more channels or add seats." },
            { q: "How long to get set up?", a: "About five minutes to connect a channel and import a calendar. Most of the value shows up in the first week." },
            { q: "Will it fit how we already work?", a: "Roles, approval stages, pillars and cadence are all configurable. You shape MultiPost Studio around your process, not the other way round." },
            { q: "What if we outgrow this setup?", a: "Every plan is the same product. Workspaces, channels and seats scale independently as you grow." },
          ]}
        />
      </Section>

      <Section title="Other ways teams use MultiPost Studio" narrow>
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((s) => (
            <Link key={s.href} href={s.href} className="cad-block cad-block-hover p-4">
              <p className="text-[15px] font-bold text-[var(--text)]">{s.label}</p>
              <p className="mt-0.5 text-[13.5px] font-medium text-[var(--text-muted)]">{s.desc}</p>
            </Link>
          ))}
        </div>
      </Section>

      <CTA action={{ label: p.cta, href: "/signup" }} />
    </main>
  );
}
