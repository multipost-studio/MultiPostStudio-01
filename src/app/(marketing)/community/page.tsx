import type { Metadata } from "next";
import { Users, MessageCircle, Calendar, Award } from "lucide-react";
import { Hero, Section, StatStrip, FAQ, CTA } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";

export const metadata: Metadata = { title: "Community" };

const CHANNELS = [
  { icon: <MessageCircle size={17} />, title: "Discussion forum", body: "Ask questions, share workflows, get help from other operators." },
  { icon: <Calendar size={17} />, title: "Monthly office hours", body: "Live sessions with the product team. Bring your feature requests." },
  { icon: <Award size={17} />, title: "Template exchange", body: "Publish your best post structures and automations; borrow others'." },
  { icon: <Users size={17} />, title: "Agency circle", body: "A smaller group for agency owners to compare notes on client work." },
];

export default function CommunityPage() {
  return (
    <main>
      <Hero
        eyebrow="Resources"
        title="The Cadence community"
        subtitle="A place to trade playbooks with people doing the same job you are — creators, small teams and agency operators, all figuring out social together."
        primary={{ label: "Create your account", href: "/signup" }}
        secondary={{ label: "Browse guides", href: "/guides" }}
      />

      <Section bleed tone="mint">
        <StatStrip
          stats={[
            { value: "6,200+", label: "members" },
            { value: "40+", label: "countries" },
            { value: "Monthly", label: "office hours" },
            { value: "Free", label: "with any plan" },
          ]}
        />
      </Section>

      <Section title="Where the conversation happens">
        <Stagger className="grid gap-4 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <StaggerItem key={c.title}>
              <div className="h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                  {c.icon}
                </span>
                <h3 className="mt-3 text-[16px] font-semibold text-[var(--text)]">{c.title}</h3>
                <p className="mt-1 text-[14px] text-[var(--text-muted)]">{c.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section bleed tone="rose" title="House rules" narrow>
        <ol className="space-y-3 text-[15.5px] font-medium leading-relaxed text-[var(--text)]">
          <li><span className="font-bold text-[var(--primary)]">1. Share the how, not just the what.</span> Screenshots of results are fine; the workflow behind them is what people came for.</li>
          <li><span className="font-bold text-[var(--primary)]">2. No pitching.</span> Link your own stuff only when it directly answers the question asked.</li>
          <li><span className="font-bold text-[var(--primary)]">3. Assume good faith.</span> Everyone here is mid-figuring-it-out. Disagree on the idea, not the person.</li>
        </ol>
      </Section>

      <Section title="Recent threads">
        <Stagger className="space-y-2">
          {[
            ["How are you handling client approvals without 12 email threads?", "Agencies · 34 replies"],
            ["Best-performing hook formats this quarter — post yours", "Content · 61 replies"],
            ["Repurposing a long YouTube video into a week of short-form", "Content · 22 replies"],
            ["What does your Monday planning routine actually look like?", "Planning · 40 replies"],
          ].map(([t, meta]) => (
            <StaggerItem key={t}>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-[14.5px] font-semibold text-[var(--text)]">{t}</p>
                <p className="mt-0.5 text-[13px] text-[var(--text-subtle)]">{meta}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        <p className="mt-4 text-[13px] text-[var(--text-subtle)]">Illustrative — the live forum opens with your account.</p>
      </Section>

      <Section bleed tone="mint" title="Community FAQ" narrow>
        <FAQ
          items={[
            { q: "Do I need a paid plan?", a: "No. Anyone with a Cadence account — free plan included — can join." },
            { q: "Is it moderated?", a: "Yes, lightly. The house rules above are enforced; the vibe is helpful, not corporate." },
            { q: "Can I share my own templates?", a: "Please do — the template exchange is one of the most-used parts." },
            { q: "Are office hours recorded?", a: "Yes. Recordings and notes are posted to the forum within a day." },
          ]}
        />
      </Section>

      <CTA title="Join in" body="The community is open to anyone with a Cadence account — free plan included." action={{ label: "Create your account", href: "/signup" }} />
    </main>
  );
}
