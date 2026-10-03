import type { Metadata } from "next";
import Link from "next/link";
import {
  PenLine, BarChart3, Inbox, Sparkles, Link2, Calendar, ListOrdered, Brain,
  CheckCheck, Workflow, Recycle, Users2,
} from "lucide-react";
import { Hero, Section, FeatureGrid, CTA } from "../_components";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = {
  title: "Features",
  description: "Publishing, scheduling, AI content, analytics, approvals and collaboration in one social media workspace.",
};

export default function FeaturesOverviewPage() {
  return (
    <main>
      <Hero
        eyebrow="Product"
        title="One workspace for the whole social workflow"
        subtitle="Each part of MultiPost Studio is useful on its own. Together they remove the copy-paste, the spreadsheets and the guesswork."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
      />

      <Section title="Create">
        <FeatureGrid
          items={[
            { icon: <Sparkles size={17} />, title: "AI Content Studio", body: "Hooks, captions, hashtags and platform variants in your voice.", href: "/features/ai-studio" },
            { icon: <PenLine size={17} />, title: "Ideas board", body: "Capture thoughts and move them through a Kanban to publish-ready.", href: "/features/ai-studio" },
            { icon: <Recycle size={17} />, title: "Evergreen recycling", body: "Keep your best posts working with frequency caps.", href: "/features/publishing" },
          ]}
        />
      </Section>

      <Section title="Plan & publish">
        <FeatureGrid
          items={[
            { icon: <Calendar size={17} />, title: "Smart Calendar", body: "Month, week, day and list — drag to reschedule.", href: "/features/publishing" },
            { icon: <ListOrdered size={17} />, title: "Per-channel queues", body: "Fixed weekly slots, drag to reschedule.", href: "/features/publishing" },
            { icon: <CheckCheck size={17} />, title: "Approval workflows", body: "Multi-stage chains with a locked audit trail.", href: "/solutions/agencies" },
          ]}
        />
      </Section>

      <Section title="Engage & analyze">
        <FeatureGrid
          items={[
            { icon: <Inbox size={17} />, title: "Community Hub", body: "Unified inbox with AI replies and sentiment.", href: "/features/engagement" },
            { icon: <BarChart3 size={17} />, title: "Analytics", body: "Cross-channel rollups and a report builder.", href: "/features/analytics" },
            { icon: <Brain size={17} />, title: "AI Insights", body: "What happened, why, and what to do next.", href: "/features/analytics" },
          ]}
        />
      </Section>

      <Section title="Scale">
        <FeatureGrid
          items={[
            { icon: <Users2 size={17} />, title: "Team collaboration", body: "Roles, permissions, comments and activity history.", href: "/solutions/marketing-teams" },
            { icon: <Workflow size={17} />, title: "Automation engine", body: "WHEN / THEN rules that run in the background.", href: "/features/publishing" },
            { icon: <Recycle size={17} />, title: "Evergreen Recycling", body: "Automatically re-queue and rotate high-performing posts.", href: "/features/recycling" },
          ]}
        />
      </Section>

      <Section bleed tone="rose" title="Browse by platform" narrow>
        <Reveal>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
            Every network has its own limits, formats and gotchas. Our per-platform guides cover
            what publishes, what doesn&apos;t yet, and how to connect — starting with{" "}
            <Link href="/platforms/instagram" className="font-semibold text-[var(--primary)] hover:underline">Instagram scheduling</Link>,{" "}
            <Link href="/platforms/linkedin" className="font-semibold text-[var(--primary)] hover:underline">LinkedIn scheduling</Link> and{" "}
            <Link href="/platforms" className="font-semibold text-[var(--primary)] hover:underline">all 10 supported platforms</Link>.
          </p>
        </Reveal>
      </Section>

      <CTA />
    </main>
  );
}
