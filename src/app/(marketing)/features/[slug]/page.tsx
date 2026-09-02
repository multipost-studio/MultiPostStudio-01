import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Hero, Section, StepList, FAQ, CTA } from "../../_components";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { MiniArea } from "../../_visuals";
import { FEATURE_PAGES } from "../../_data";

const OTHER_FEATURES = [
  { href: "/features/publishing", label: "Publishing & calendar" },
  { href: "/features/ai-studio", label: "AI Content Studio" },
  { href: "/features/engagement", label: "Community Hub" },
  { href: "/features/analytics", label: "Analytics & Insights" },
  { href: "/features/link-hub", label: "Link Hub" },
];

export function generateStaticParams() {
  return Object.keys(FEATURE_PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = FEATURE_PAGES[slug];
  return { title: p ? p.name : "Feature", description: p?.intro };
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = FEATURE_PAGES[slug];
  if (!p) notFound();

  const others = OTHER_FEATURES.filter((f) => f.href !== `/features/${slug}`);

  return (
    <main>
      <Hero
        eyebrow="Product"
        title={p.tagline}
        subtitle={p.intro}
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "Try the demo", href: "/login" }}
      />

      <Section title="What you get">
        <Stagger className="grid gap-4 sm:grid-cols-2">
          {p.points.map((pt) => (
            <StaggerItem key={pt.title}>
              <div className="h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Check size={13} />
                  </span>
                  <h3 className="text-[16px] font-semibold text-[var(--text)]">{pt.title}</h3>
                </div>
                <p className="mt-2 text-[14px] text-[var(--text-muted)]">{pt.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section bleed tone="rose" title="How it fits your day" narrow>
        <StepList
          steps={[
            { title: "Set it up once", body: "Connect your accounts and set your defaults — pillars, cadence, roles. Five minutes." },
            { title: "Work in one place", body: "This feature lives alongside the composer, calendar and inbox — no tab-switching, no copy-paste." },
            { title: "Let it compound", body: "Cadence learns from your results and does more of the placing, drafting and flagging for you over time." },
          ]}
        />
      </Section>

      <Section narrow>
        <div className="grid items-center gap-8 sm:grid-cols-2">
          <Reveal>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]">
              <p className="text-4xl font-extrabold text-[var(--primary)]">{p.stat.value}</p>
              <p className="mt-1 text-[14px] font-medium text-[var(--text-muted)]">{p.stat.label}</p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
              <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">In context</p>
              <MiniArea />
            </div>
          </Reveal>
        </div>
      </Section>

      <Section bleed tone="mint" title="Questions" narrow>
        <FAQ
          items={[
            { q: "Is this on the free plan?", a: "The core of every feature is available free. Volume limits (channels, seats, AI credits) rise with paid plans — see pricing." },
            { q: "Does it work with my platforms?", a: "Cadence supports 10+ networks including Instagram, Facebook, LinkedIn, X, TikTok, YouTube, Pinterest, Threads, Bluesky and Google Business." },
            { q: "Can I export my data?", a: "Yes — posts, media, analytics and the audit log. Nothing is locked in." },
          ]}
        />
      </Section>

      <Section title="Explore the rest of Cadence" narrow>
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((f) => (
            <Link key={f.href} href={f.href} className="cad-block cad-block-hover p-4 text-[15px] font-bold text-[var(--text)]">
              {f.label} <span className="text-[var(--primary)]">→</span>
            </Link>
          ))}
        </div>
      </Section>

      <CTA />
    </main>
  );
}
