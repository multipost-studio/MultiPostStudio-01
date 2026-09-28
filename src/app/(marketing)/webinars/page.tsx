import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, FeatureGrid, CTA } from "../_components";
import { Sparkles, CheckCheck, BarChart3, Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Webinars",
  description: "Book a live walkthrough of MultiPost Studio — content batching, approvals, analytics or agency onboarding.",
};

export default function WebinarsPage() {
  return (
    <main>
      <Hero
        eyebrow="Resources"
        title="Webinars"
        subtitle="Book a live, screen-shared walkthrough of MultiPost Studio — 30 minutes, practical, with time for questions."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "Browse guides", href: "/guides" }}
      />

      <Section title="Session tracks" intro="Ask for the walkthrough that matches where you're stuck.">
        <FeatureGrid
          items={[
            { icon: <Sparkles size={17} />, title: "Content at scale", body: "Batch a quarter of posts in an afternoon using the Ideas board and AI Studio." },
            { icon: <CheckCheck size={17} />, title: "Approvals without friction", body: "Set up chains that protect quality without becoming a bottleneck." },
            { icon: <BarChart3 size={17} />, title: "Analytics like a strategist", body: "Move past vanity metrics to the numbers that predict growth." },
            { icon: <Building2 size={17} />, title: "Agency onboarding", body: "Stand up a new client workspace, channels and reports end to end." },
          ]}
        />
        <p className="mt-6 text-[14px] text-[var(--text-muted)]">
          <Link href="/contact?topic=sales" className="text-[var(--primary)] underline">Ask for a private walkthrough</Link> for your team.
        </p>
      </Section>

      <Section title="What to expect" narrow>
        <ul className="space-y-2.5 text-[15.5px] font-medium leading-relaxed text-[var(--text)]">
          {[
            "30 minutes: ~20 minutes walkthrough, ~10 minutes live Q&A.",
            "Screen-shared inside a real MultiPost Studio workspace — no slideware.",
            "A recording and a one-page recap sent afterward.",
            "No pitch. If MultiPost Studio isn't the fit for your problem, we'll say so.",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <CTA title="Learn by doing instead" body="The free plan takes five minutes to set up — connect a channel and try it yourself." action={{ label: "Get started free", href: "/signup" }} />
    </main>
  );
}
