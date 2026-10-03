import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Hero, Section, FAQ, CTA, Breadcrumbs, CheckList } from "../../_components";
import { Reveal } from "@/components/motion";
import { appUrl } from "@/lib/env";
import { PLATFORMS } from "@/lib/constants";
import { CONNECT_STEPS, PLATFORM_SEO, getPlatform } from "../_platform-data";
import { KeyTakeaways, PlatformCapabilityTable, RelatedGrid } from "../../_seo";

export async function generateStaticParams() {
  return PLATFORM_SEO.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getPlatform(slug);
  const baseUrl = appUrl().replace(/\/$/, "");
  if (!p) return { title: "Platform" };
  const title = `${PLATFORMS[p.key].label} scheduling & publishing | MultiPost Studio`;
  const description = p.answer;
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/platforms/${p.slug}` },
    openGraph: { title, description, url: `${baseUrl}/platforms/${p.slug}`, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PlatformPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getPlatform(slug);
  if (!p) notFound();
  const label = PLATFORMS[p.key].label;

  return (
    <main>
      <Breadcrumbs
        items={[{ name: "Platforms", path: "/platforms" }, { name: label, path: `/platforms/${p.slug}` }]}
      />
      <Hero
        eyebrow="Platforms"
        title={`${label} scheduling that respects the platform`}
        subtitle={p.tagline}
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "All platforms", href: "/platforms" }}
      />

      {/* Direct answer first (AEO) */}
      <Section narrow>
        <KeyTakeaways
          points={[
            p.answer,
            `Account needed: ${p.accountNote}`,
            "Every variant is validated against character and media limits before it schedules — nothing fails silently at publish time.",
          ]}
        />
      </Section>

      <Section narrow>
        <Reveal>
          <h2 className="text-[1.6rem] font-extrabold tracking-[-0.02em] text-[var(--text)] sm:text-[2rem]">
            What you can publish to {label}
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-muted)]">{p.intro}</p>
        </Reveal>
        <Reveal delay={0.08} className="mt-6">
          <PlatformCapabilityTable platform={p.key} />
          <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
            Live from MultiPost Studio&apos;s capability matrix — the same rules the composer enforces.
          </p>
        </Reveal>
      </Section>

      <Section bleed tone="rose" narrow>
        <Reveal>
          <h2 className="text-[1.6rem] font-extrabold tracking-[-0.02em] text-[var(--text)] sm:text-[2rem]">
            Who {label} scheduling fits
          </h2>
        </Reveal>
        <CheckList items={p.bestFor} className="mt-5" />
      </Section>

      <Section narrow>
        <Reveal>
          <h2 className="text-[1.6rem] font-extrabold tracking-[-0.02em] text-[var(--text)] sm:text-[2rem]">
            How to connect {label}
          </h2>
        </Reveal>
        <ol className="mt-5 space-y-2.5">
          {CONNECT_STEPS.map((s, i) => (
            <li key={s} className="flex gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[13px] font-extrabold text-[var(--primary-text)]">
                {i + 1}
              </span>
              <p className="text-[14.5px] font-medium leading-relaxed text-[var(--text)]">{s}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section bleed tone="mint" title={`${label} questions`} narrow>
        <FAQ items={p.faqs} />
      </Section>

      <Section title="Keep exploring" narrow>
        <RelatedGrid
          items={[
            ...p.related
              .map((s) => PLATFORM_SEO.find((x) => x.slug === s))
              .filter((x): x is NonNullable<typeof x> => !!x)
              .map((x) => ({
                href: `/platforms/${x.slug}`,
                title: `${PLATFORMS[x.key].label} scheduling`,
                body: x.tagline,
              })),
            { href: "/features/publishing", title: "How publishing works", body: "Queues, retries and per-channel timing." },
            { href: "/pricing", title: "Plans and channel limits", body: "Start free, upgrade when you add channels." },
          ]}
        />
        <Reveal className="mt-6 text-center">
          <Link href="/platforms" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--primary)] hover:underline">
            All supported platforms <ArrowRight size={15} />
          </Link>
        </Reveal>
      </Section>

      <CTA
        title={`${label} on autopilot, minus the tab-switching`}
        body="Connect your account, set queue slots from your own data, and draft once for every platform."
      />
    </main>
  );
}
