import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, FeatureGrid, CTA } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCheck, BarChart3, Building2 } from "lucide-react";

export const metadata: Metadata = { title: "Webinars" };

const SESSIONS = [
  { title: "Building a quarter of content in one afternoon", when: "Sep 24, 2026 · 11:00 ET", status: "upcoming" },
  { title: "Approvals that don't slow you down", when: "Oct 8, 2026 · 14:00 ET", status: "upcoming" },
  { title: "Reading analytics like a strategist", when: "Aug 20, 2026", status: "on-demand" },
  { title: "Agency onboarding, start to finish", when: "Jul 30, 2026", status: "on-demand" },
];

export default function WebinarsPage() {
  return (
    <main>
      <Hero
        eyebrow="Resources"
        title="Webinars"
        subtitle="Live sessions and recordings on getting more out of Cadence — 30 minutes, practical, with time for questions."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "Browse guides", href: "/guides" }}
      />

      <Section title="Session tracks" intro="Each recording is built around one workflow. Watch the one that matches where you're stuck.">
        <FeatureGrid
          items={[
            { icon: <Sparkles size={17} />, title: "Content at scale", body: "Batch a quarter of posts in an afternoon using the Ideas board and AI Studio." },
            { icon: <CheckCheck size={17} />, title: "Approvals without friction", body: "Set up chains that protect quality without becoming a bottleneck." },
            { icon: <BarChart3 size={17} />, title: "Analytics like a strategist", body: "Move past vanity metrics to the numbers that predict growth." },
            { icon: <Building2 size={17} />, title: "Agency onboarding", body: "Stand up a new client workspace, channels and reports end to end." },
          ]}
        />
      </Section>

      <Section bleed tone="rose" title="Upcoming & on-demand">
        <Stagger className="space-y-2">
          {SESSIONS.map((s) => (
            <StaggerItem key={s.title}>
              <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
                <div>
                  <p className="text-[15px] font-semibold text-[var(--text)]">{s.title}</p>
                  <p className="text-[13px] text-[var(--text-subtle)]">{s.when}</p>
                </div>
                <Badge tone={s.status === "upcoming" ? "info" : "neutral"}>
                  {s.status === "upcoming" ? "Register" : "Watch"}
                </Badge>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        <p className="mt-6 text-[14px] text-[var(--text-muted)]">
          Want a session for your team? <Link href="/contact" className="text-[var(--primary)] underline">Ask for a private walkthrough</Link>.
        </p>
      </Section>

      <Section title="What to expect" narrow>
        <ul className="space-y-2.5 text-[15.5px] font-medium leading-relaxed text-[var(--text)]">
          {[
            "30 minutes: ~20 minutes walkthrough, ~10 minutes live Q&A.",
            "Screen-shared inside a real Cadence workspace — no slideware.",
            "A recording and a one-page recap sent to everyone who registers.",
            "No pitch. If Cadence isn't the fit for your problem, we'll say so.",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <CTA title="Learn by doing instead" body="The free plan takes five minutes to set up — connect a channel and follow along with any recording." action={{ label: "Get started free", href: "/signup" }} />
    </main>
  );
}
