import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, Hash, Clock, Ruler, Calculator } from "lucide-react";
import { Hero, Section, SplitFeature, FAQ, CTA } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";
import { MiniBars } from "../_visuals";

export const metadata: Metadata = { title: "Free tools" };

const TOOLS = [
  { href: "/tools/caption-generator", icon: <Sparkles size={17} />, title: "Caption generator", body: "Three on-brand captions from a one-line prompt.", live: true },
  { href: "/tools/hashtag-generator", icon: <Hash size={17} />, title: "Hashtag generator", body: "A clean hashtag set from any topic.", live: true },
  { href: "/tools/best-time", icon: <Clock size={17} />, title: "Best-time calculator", body: "A sensible starting schedule by platform.", live: true },
  { href: "/tools/character-counter", icon: <Ruler size={17} />, title: "Character counter", body: "Live count against every platform's limit.", live: true },
  { href: "/tools/engagement-rate", icon: <Calculator size={17} />, title: "Engagement-rate calculator", body: "Rate from reach or followers.", live: true },
];

export default function ToolsPage() {
  return (
    <main>
      <Hero
        eyebrow="Free tools"
        title="Small tools, no signup"
        subtitle="Quick generators and calculators for when you just need one thing done. Free, private, and instant — nothing you type is stored."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "Read the guides", href: "/guides" }}
      />
      <Section title="Pick a tool">
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <StaggerItem key={t.href}>
              <Link
                href={t.href}
                className="block h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--primary)]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                  {t.icon}
                </span>
                <p className="mt-3 text-[16px] font-semibold text-[var(--text)]">{t.title}</p>
                <p className="mt-1 text-[14px] text-[var(--text-muted)]">{t.body}</p>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section bleed tone="rose">
        <SplitFeature
          eyebrow="Inside MultiPost Studio"
          title="The same tools, running on your data"
          body="These standalone versions guess. Inside MultiPost Studio, the caption generator uses your Brand Brain, the hashtag sets are checked against live limits, best-time comes from your own engagement history, and the character counter sits right in the composer."
          bullets={[
            "Suggestions tuned to your voice and past performance",
            "One draft, checked against every connected platform at once",
            "Best-time that updates automatically as your audience shifts",
          ]}
          href={{ label: "See all features", url: "/features" }}
          visual={
            <div>
              <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">Engagement by format</p>
              <MiniBars />
            </div>
          }
        />
      </Section>

      <Section title="About these tools" narrow>
        <FAQ
          items={[
            { q: "Do I need an account?", a: "No. Every tool on this page works with no sign-up." },
            { q: "Is my input saved anywhere?", a: "No. They run entirely in your browser — nothing is sent to a server or stored." },
            { q: "Can I use them commercially?", a: "Yes, freely. Attribution is appreciated but not required." },
            { q: "Will more tools be added?", a: "Yes — we add one whenever a request comes up often enough. Suggest one via the contact form." },
          ]}
        />
      </Section>

      <CTA title="Ready for the real thing?" body="Free forever plan, no card. The full workflow — ideate, plan, publish, engage, analyze — in one place." action={{ label: "Get started free", href: "/signup" }} />
    </main>
  );
}
