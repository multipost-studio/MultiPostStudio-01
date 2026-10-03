import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero, Section, FAQ, CTA, Breadcrumbs } from "../_components";
import { Reveal } from "@/components/motion";
import { appUrl } from "@/lib/env";
import { KeyTakeaways, RelatedGrid } from "../_seo";

const baseUrl = appUrl().replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Learn social media management | MultiPost Studio",
  description:
    "Free, practical guides to social media scheduling, content planning, approval workflows and analytics — frameworks that work with any tool, built around real product workflows.",
  alternates: { canonical: `${baseUrl}/learn` },
  openGraph: {
    title: "Learn social media management | MultiPost Studio",
    description: "Practical frameworks for scheduling, planning, approvals and analytics.",
    url: `${baseUrl}/learn`,
    type: "website",
  },
};

const CLUSTERS: {
  title: string;
  body: string;
  links: { href: string; title: string; body: string }[];
}[] = [
  {
    title: "Scheduling that survives real life",
    body: "Consistency beats virality, and consistency is a queue — not willpower. Start with your own engagement data, fix weekly slots per channel, and let evergreen recycling cover the gaps.",
    links: [
      { href: "/guides/posting-schedule", title: "Designing a posting schedule around real data", body: "Turn 90 days of engagement history into weekly queue slots." },
      { href: "/blog/consistency-beats-virality", title: "Consistency beats virality", body: "Why the trend line matters more than the spikes." },
      { href: "/tools/best-time", title: "Best-time calculator", body: "A sensible starting schedule by platform." },
      { href: "/features/publishing", title: "How publishing works", body: "Queues, retries and per-channel timing in MultiPost Studio." },
    ],
  },
  {
    title: "Content planning without the blank page",
    body: "A blank composer is a planning failure, not a creativity failure. Decide your pillars once, repurpose every strong idea across formats, and keep your voice intact when AI helps.",
    links: [
      { href: "/guides/content-pillars", title: "Building content pillars that don't get stale", body: "A repeatable framework for deciding what to post." },
      { href: "/guides/repurposing", title: "Repurposing one idea into a week of posts", body: "One claim, native execution per platform." },
      { href: "/blog/brand-voice-that-survives-ai", title: "A brand voice that survives AI", body: "How to keep generated content sounding like you." },
      { href: "/features/ai-studio", title: "AI Studio", body: "Brand-calibrated drafts, rewrites and variants." },
    ],
  },
  {
    title: "Approvals that don't bottleneck",
    body: "Review chains fail when they're one vague gate. Name the real stages — creator, editor, manager, client — freeze approved versions, and track every action.",
    links: [
      { href: "/guides/agency-onboarding", title: "Onboarding a new client in a day", body: "Brand kit, channels, approvals and the first month of content." },
      { href: "/blog/approvals-without-the-bottleneck", title: "Approvals without the bottleneck", body: "Why frozen versions make review trustworthy." },
      { href: "/solutions/marketing-teams", title: "For marketing teams", body: "Roles, campaigns and a calendar the team trusts." },
      { href: "/solutions/agencies", title: "For agencies", body: "Client workspaces, review portals and white-label reports." },
    ],
  },
  {
    title: "Analytics that change Monday",
    body: "A chart going up is nice; a decision is better. Track reach, engagement and follower growth per channel, find which formats move numbers, and shift slots toward them.",
    links: [
      { href: "/blog/what-your-analytics-should-tell-you", title: "What your analytics should tell you", body: "What happened, why, and what to do next." },
      { href: "/features/analytics", title: "Analytics & reports", body: "Rollups, breakdowns, health score and scheduled reports." },
      { href: "/tools/engagement-rate", title: "Engagement-rate calculator", body: "Rate from reach or followers, instantly." },
      { href: "/platforms/instagram", title: "Instagram scheduling", body: "Formats, limits and honest constraints." },
    ],
  },
];

export default function LearnHubPage() {
  return (
    <main>
      <Breadcrumbs items={[{ name: "Learn", path: "/learn" }]} />
      <Hero
        eyebrow="Learn"
        title="Social media, explained like a practitioner"
        subtitle="Free frameworks for scheduling, planning, approvals and analytics. Written from real workflows — useful with any tool, sharpest with MultiPost Studio."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "Browse guides", href: "/guides" }}
      />

      <Section narrow>
        <KeyTakeaways
          points={[
            "Post on a fixed weekly schedule built from your own engagement data — not someone else's 'best times' list.",
            "Decide 3–5 content pillars per quarter and score every draft against them before scheduling.",
            "Run approvals as named stages with frozen sign-offs; review the trend line monthly, not the spikes.",
          ]}
        />
      </Section>

      {CLUSTERS.map((c, ci) => (
        <Section key={c.title} bleed={ci % 2 === 1} tone={ci % 2 === 1 ? "rose" : "plain"}>
          <Reveal className="max-w-2xl">
            <h2 className="text-[1.7rem] font-extrabold tracking-[-0.02em] text-[var(--text)] sm:text-[2.1rem]">
              {c.title}
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-muted)]">{c.body}</p>
          </Reveal>
          <RelatedGrid items={c.links} />
        </Section>
      ))}

      <Section bleed tone="mint" title="Learning questions" narrow>
        <FAQ
          items={[
            { q: "Where do I start with social media management?", a: "Fix a weekly schedule first: 3–5 slots per channel from your engagement data. Then add pillars so you always know what to post. Tools come third." },
            { q: "How often should a small team post?", a: "Four to five posts a week across your main channels beats daily posting for a month then silence. Consistency compounds; bursts don't." },
            { q: "Do I need paid tools to start?", a: "No. The frameworks above work with free plans and native scheduling. Paid tools buy back time (queues, approvals, analytics) once volume grows." },
            { q: "How do I prove social media is working?", a: "Track reach, engagement rate and follower growth per channel month over month, and tie standout posts to business outcomes in a one-page monthly report." },
          ]}
        />
        <Reveal className="mt-6 text-center">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--primary)] hover:underline">
            All articles <ArrowRight size={15} />
          </Link>
        </Reveal>
      </Section>

      <CTA
        title="Put the frameworks on autopilot"
        body="Queues, approvals, AI drafts and analytics that say what to do next — free to start."
      />
    </main>
  );
}
