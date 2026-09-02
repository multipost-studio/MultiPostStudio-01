import Link from "next/link";
import { Wand2, Hash, Ruler, Clock3, TrendingUp } from "lucide-react";
import { Section, StepList, FAQ } from "../_components";

const ALL_TOOLS = [
  { slug: "caption-generator", label: "Caption generator", icon: <Wand2 size={16} />, blurb: "Three on-brand captions from a one-line brief." },
  { slug: "hashtag-generator", label: "Hashtag generator", icon: <Hash size={16} />, blurb: "Relevant hashtag sets grouped by reach." },
  { slug: "character-counter", label: "Character counter", icon: <Ruler size={16} />, blurb: "Live count against every platform limit." },
  { slug: "best-time", label: "Best time to post", icon: <Clock3 size={16} />, blurb: "A starting-point posting schedule by platform." },
  { slug: "engagement-rate", label: "Engagement rate", icon: <TrendingUp size={16} />, blurb: "Calculate ER by reach, impressions or followers." },
];

export function ToolShell({
  slug,
  title,
  description,
  intro,
  steps,
  tips,
  faq,
  children,
}: {
  slug: string;
  title: string;
  description: string;
  intro?: string;
  steps?: { title: string; body: string }[];
  tips?: string[];
  faq?: { q: string; a: string }[];
  children: React.ReactNode;
}) {
  const others = ALL_TOOLS.filter((t) => t.slug !== slug);
  return (
    <main>
      <Section narrow>
        <Link href="/tools" className="text-[14px] font-medium text-[var(--text-muted)] hover:underline">
          ← All free tools
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-[var(--text-muted)]">{description}</p>
        {intro && (
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[var(--text-subtle)]">{intro}</p>
        )}
        <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
          {children}
        </div>
        <p className="mt-3 text-[13px] text-[var(--text-subtle)]">
          Free, no sign-up. Runs entirely in your browser — nothing you type is stored.
        </p>
      </Section>

      {steps && (
        <Section bleed tone="rose" title="How it works" narrow>
          <StepList steps={steps} />
        </Section>
      )}

      {tips && (
        <Section title="Tips for better results" narrow>
          <ul className="space-y-2.5 text-[15.5px] font-medium leading-relaxed text-[var(--text)]">
            {tips.map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                {t}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {faq && (
        <Section bleed tone="mint" title="Questions" narrow>
          <FAQ items={faq} />
        </Section>
      )}

      <Section title="More free tools" narrow>
        <div className="grid gap-4 sm:grid-cols-2">
          {others.map((t) => (
            <Link
              key={t.slug}
              href={`/tools/${t.slug}`}
              className="cad-block cad-block-hover flex items-start gap-3 p-4"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--primary-soft)] text-[var(--primary)]">
                {t.icon}
              </span>
              <span>
                <span className="block text-[15px] font-bold text-[var(--text)]">{t.label}</span>
                <span className="mt-0.5 block text-[13.5px] font-medium text-[var(--text-muted)]">{t.blurb}</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section bleed tone="rose" narrow>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-[var(--shadow)]">
          <h2 className="text-[1.4rem] font-bold text-[var(--text)]">Want this inside your workflow?</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] font-medium text-[var(--text-muted)]">
            In Cadence, every one of these runs on your own data and connected accounts — inside the
            composer, calendar and analytics. Free forever plan, no card.
          </p>
          <Link
            href="/signup"
            className="mt-5 inline-flex h-10 items-center rounded-[var(--radius-full)] bg-[var(--primary)] px-6 text-[14px] font-bold text-[var(--primary-text)]"
          >
            Get started free
          </Link>
        </div>
      </Section>
    </main>
  );
}
