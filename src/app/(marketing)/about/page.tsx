import type { Metadata } from "next";
import { Hero, Section, CTA } from "../_components";
import { Reveal, Stagger , StaggerItem} from "@/components/motion";

export const metadata: Metadata = { title: "About" };

const VALUES = [
  { title: "Control before automation", body: "AI drafts and suggests. People decide what ships. Consequential actions always ask first." },
  { title: "One connected workspace", body: "The cost of social isn't any single task — it's the seams between them. We remove seams." },
  { title: "Plain-English output", body: "A dashboard that doesn't tell you what to do on Monday isn't finished." },
  { title: "Boring reliability", body: "Publishing should be the least exciting part of your week." },
];

const TEAM = [
  { name: "Avery Quinn", role: "Founder & CEO" },
  { name: "Maya Osei", role: "Head of Product" },
  { name: "Leo Marchetti", role: "Head of Engineering" },
  { name: "Sam Okafor", role: "Head of Growth" },
];

export default function AboutPage() {
  return (
    <main>
      <Hero
        eyebrow="Company"
        title="We're building the operating system for social media work"
        subtitle="Cadence started as an internal tool for an agency that was drowning in tabs. It turned out everyone had the same problem."
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

      <Section title="The team">
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map((t) => (
            <StaggerItem key={t.name}>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[16px] font-semibold text-[var(--primary)]">
                  {t.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <p className="mt-3 text-[15px] font-semibold text-[var(--text)]">{t.name}</p>
                <p className="text-[13px] text-[var(--text-subtle)]">{t.role}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal>
          <p className="mt-6 text-center text-[14px] text-[var(--text-muted)]">
            Fully remote, 20-ish people, on four continents.{" "}
            <a href="/careers" className="text-[var(--primary)] underline">We&apos;re hiring.</a>
          </p>
        </Reveal>
      </Section>

      <CTA />
    </main>
  );
}
