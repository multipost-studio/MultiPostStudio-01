import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero, Section, StepList, CTA } from "../_components";
import { Reveal, Stagger , StaggerItem} from "@/components/motion";
import { JOBS } from "../_data";

export const metadata: Metadata = { title: "Careers" };

const PERKS = [
  "Fully remote, async-first",
  "4-day weeks in July and August",
  "Real equity, transparent bands",
  "Home-office and learning budgets",
  "Quarterly team gatherings",
  "Unlimited, actually-taken PTO",
];

export default function CareersPage() {
  return (
    <main>
      <Hero
        eyebrow="Careers"
        title="Do the best work of your career, from anywhere"
        subtitle="Small team, high trust, no busywork. We ship, we measure, we adjust — and we build in the open."
        primary={{ label: "See open roles", href: "#roles" }}
        secondary={{ label: "How we work", href: "/about" }}
      />

      <Section title="What we value" narrow>
        <ul className="space-y-3 text-[15.5px] font-medium leading-relaxed text-[var(--text)]">
          <li><span className="font-bold text-[var(--primary)]">Ship to learn.</span> A rough thing in front of users beats a perfect thing in a doc.</li>
          <li><span className="font-bold text-[var(--primary)]">Write it down.</span> Async-first only works if decisions and context live in writing.</li>
          <li><span className="font-bold text-[var(--primary)]">Own the outcome.</span> You&apos;re trusted with the goal, not handed a task list.</li>
          <li><span className="font-bold text-[var(--primary)]">Respect the craft.</span> Fast, but never sloppy on the parts users feel.</li>
        </ul>
      </Section>

      <Section id="roles" title="Open roles">
        <Stagger className="space-y-2">
          {JOBS.map((j) => (
            <StaggerItem key={j.slug}>
              <Link
                href={`/careers/${j.slug}`}
                className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--primary)]"
              >
                <div>
                  <p className="text-[15px] font-semibold text-[var(--text)]">{j.title}</p>
                  <p className="text-[13px] text-[var(--text-subtle)]">
                    {j.team} · {j.location} · {j.type}
                  </p>
                </div>
                <ArrowRight size={16} className="text-[var(--text-subtle)]" />
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section bleed tone="rose" title="Perks & how we work">
        <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PERKS.map((p) => (
            <StaggerItem key={p}>
              <div className="mps-block p-4 text-[14.5px] font-medium text-[var(--text)]">{p}</div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section title="Our hiring process" intro="Four steps, about two weeks end to end. No take-home that eats your weekend.">
        <StepList
          steps={[
            { title: "Intro call (30 min)", body: "Mutual fit — what you want, what the role is, how we work. With the hiring manager." },
            { title: "Craft conversation (60 min)", body: "Walk through real problems in your area. Collaborative, not a quiz." },
            { title: "Paid work session", body: "A short, scoped, paid piece of real work — done on your own time, reviewed together." },
            { title: "Team + offer", body: "Meet two people you'd work with, then a decision within 48 hours." },
          ]}
        />
        <Reveal>
          <p className="mt-6 text-[14px] text-[var(--text-muted)]">
            Don&apos;t see your role? Tell us what you&apos;d do —{" "}
            <Link href="/contact" className="text-[var(--primary)] underline">get in touch</Link>.
          </p>
        </Reveal>
      </Section>

      <CTA title="Curious but not sure?" body="Try the product first — the free plan shows you exactly what we build and how it feels." action={{ label: "Start free", href: "/signup" }} />
    </main>
  );
}
