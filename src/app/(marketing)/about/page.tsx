import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, CTA } from "../_components";
import { Reveal, Stagger , StaggerItem} from "@/components/motion";

export const metadata: Metadata = {
  title: "About",
  description: "Why MultiPost Studio exists: one connected workspace for planning, creating, scheduling, publishing and analyzing social content.",
};

const VALUES = [
  { title: "Control before automation", body: "AI drafts and suggests. People decide what ships. Consequential actions always ask first." },
  { title: "One connected workspace", body: "The cost of social isn't any single task — it's the seams between them. We remove seams." },
  { title: "Plain-English output", body: "A dashboard that doesn't tell you what to do on Monday isn't finished." },
  { title: "Boring reliability", body: "Publishing should be the least exciting part of your week." },
];

export default function AboutPage() {
  return (
    <main>
      <Hero
        eyebrow="Company"
        title="We're building the operating system for social media work"
        subtitle="MultiPost Studio started as an internal tool for an agency that was drowning in tabs. It turned out everyone had the same problem."
      />

      <Section title="What we believe">
        <Stagger className="grid gap-4 sm:grid-cols-2">
          {VALUES.map((v) => (
            <StaggerItem key={v.title}>
              <div className="h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
                <h3 className="text-[16px] font-semibold text-[var(--text)]">{v.title}</h3>
                <p className="mt-1 text-[14px] text-[var(--text-muted)]">{v.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section title="Join us">
        <Reveal>
          <p className="text-center text-[14px] text-[var(--text-muted)]">
            We&apos;re a small, remote team.{" "}
            <Link href="/careers" className="text-[var(--primary)] underline">See open roles.</Link>
          </p>
        </Reveal>
      </Section>

      <CTA />
    </main>
  );
}
