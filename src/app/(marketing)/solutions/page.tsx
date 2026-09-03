import type { Metadata } from "next";
import Link from "next/link";
import {
  Sparkles, Store, Building2, Users2, Rocket, ShieldCheck,
  CalendarClock, Inbox, BarChart3, CheckCheck, Workflow,
} from "lucide-react";
import { Hero, Section, FeatureGrid, StatStrip, FAQ, CTA } from "../_components";
import { MiniArea } from "../_visuals";
import { getNavLinks } from "@/lib/cms";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "MultiPost Studio adapts to how you work — whether you're a solo creator, a small business, an agency running dozens of clients, an in-house marketing team, a startup, or an enterprise with governance needs.",
};

const PERSONA_ICON: Record<string, React.ReactNode> = {
  "/solutions/creators": <Sparkles size={17} />,
  "/solutions/small-business": <Store size={17} />,
  "/solutions/agencies": <Building2 size={17} />,
  "/solutions/marketing-teams": <Users2 size={17} />,
  "/solutions/startups": <Rocket size={17} />,
  "/solutions/enterprise": <ShieldCheck size={17} />,
};

export default async function SolutionsOverviewPage() {
  const SOLUTION_LINKS = await getNavLinks("solution");
  return (
    <main>
      <Hero
        eyebrow="Solutions"
        title="Built for the way you actually work"
        subtitle="Same operating system, different starting point. Pick the setup that matches your team — MultiPost Studio scales with you from your first post to your millionth."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "Compare plans", href: "/pricing" }}
      />

      <Section title="Find your fit" intro="Every plan includes the full workflow — ideate, create, plan, approve, publish, engage, analyze. These are the shapes teams usually start from.">
        <FeatureGrid
          items={SOLUTION_LINKS.map((s) => ({
            icon: PERSONA_ICON[s.href],
            title: s.label,
            body: s.desc ?? "",
            href: s.href,
          }))}
        />
      </Section>

      <Section bleed tone="rose" title="Why teams switch to MultiPost Studio" intro="The busywork of social — the scheduling, the chasing approvals, the copy-paste reporting — is exactly what MultiPost Studio takes off your plate.">
        <FeatureGrid
          items={[
            { icon: <CalendarClock size={17} />, title: "One calendar everyone trusts", body: "Month, week, day and list views. Drag to reschedule. Per-channel queues place posts at the best time." },
            { icon: <Sparkles size={17} />, title: "AI that sounds like you", body: "The Brand Brain learns your voice, then drafts hooks, captions, hashtags and platform variants — and scores each post before it ships." },
            { icon: <CheckCheck size={17} />, title: "Approvals that can't go wrong", body: "Multi-stage chains, an immutable audit trail, and approved versions that are never silently overwritten." },
            { icon: <Inbox size={17} />, title: "Every conversation in one inbox", body: "Comments, mentions, DMs and reviews across every network, with sentiment, priority and one-click AI replies." },
            { icon: <BarChart3 size={17} />, title: "Reporting without the spreadsheet", body: "Cross-channel rollups, a drag-and-drop report builder, white-label PDFs and a 0–100 health score." },
            { icon: <Workflow size={17} />, title: "Automations for the repetitive parts", body: "WHEN a post goes live, THEN notify. WHEN engagement spikes, THEN mark evergreen. Set it once." },
          ]}
        />
      </Section>

      <Section title="What it looks like in practice" narrow>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">
            Cross-channel performance · last 30 days
          </p>
          <MiniArea />
          <p className="mt-3 text-[14px] font-medium leading-relaxed text-[var(--text-muted)]">
            <span className="font-bold text-[var(--text)]">AI Insights</span> reads this the same way you
            would — then tells you what happened, why, and the next move. Not just a chart.
          </p>
        </div>
      </Section>

      <Section bleed tone="mint">
        <StatStrip
          stats={[
            { value: "10+", label: "platforms" },
            { value: "8", label: "workflow stages" },
            { value: "79,871", label: "customers" },
            { value: "4.9", label: "average rating" },
          ]}
        />
      </Section>

      <Section title="Common questions" narrow>
        <FAQ
          items={[
            { q: "Can I change plans as my team grows?", a: "Yes — upgrade or downgrade any time. Workspaces, channels and seats scale independently, so you only pay for what you use." },
            { q: "Do agencies get separate client workspaces?", a: "Every client gets an isolated workspace: its own brand, channels, team, approvals and reports. The agency overview rolls them all up." },
            { q: "Is there SSO and role-based access?", a: "Enterprise plans include SSO/SCIM. Every plan has an org + workspace permission matrix with roles like owner, manager, editor, creator, analyst and client." },
            { q: "What happens to my data if I cancel?", a: "You can export everything — posts, media, analytics and the full audit log — before you go. Soft-deleted data is purged on a fixed schedule." },
          ]}
        />
      </Section>

      <CTA
        title="Start where you are"
        body="Free forever plan, no card. Connect a channel, import your calendar, and let MultiPost Studio run the boring parts."
        action={{ label: "Get started free", href: "/signup" }}
      />

      <p className="sr-only">
        <Link href="/features">All features</Link>
        <Link href="/pricing">Pricing</Link>
      </p>
    </main>
  );
}
