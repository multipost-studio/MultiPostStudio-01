import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero, Section, CTA, Breadcrumbs } from "../_components";
import { Stagger, StaggerItem } from "@/components/motion";
import { appUrl } from "@/lib/env";
import { PLATFORMS } from "@/lib/constants";
import { PLATFORM_SEO } from "./_platform-data";
import { KeyTakeaways } from "../_seo";

const baseUrl = appUrl().replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Supported platforms | MultiPost Studio",
  description:
    "MultiPost Studio connects and publishes to Instagram, Facebook, LinkedIn, X, TikTok, YouTube, Pinterest, Threads, Bluesky and Google Business Profile — with honest per-platform limits.",
  alternates: { canonical: `${baseUrl}/platforms` },
  openGraph: {
    title: "Supported platforms | MultiPost Studio",
    description: "10 networks, one queue — with honest per-platform limits.",
    url: `${baseUrl}/platforms`,
    type: "website",
  },
};

export default function PlatformsIndexPage() {
  return (
    <main>
      <Breadcrumbs items={[{ name: "Platforms", path: "/platforms" }]} />
      <Hero
        eyebrow="Platforms"
        title="10 networks. One queue. Honest limits."
        subtitle="Every platform MultiPost Studio connects to — what publishes, what doesn't yet, and exactly why."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "How publishing works", href: "/features/publishing" }}
      />

      <Section narrow>
        <KeyTakeaways
          points={[
            "MultiPost Studio connects and publishes to 10 networks through official APIs — no gray-area automation.",
            "Limits are enforced in the composer before scheduling: character counts, media rules and unsupported types fail loudly, never silently.",
            "Where a platform blocks third-party publishing (Facebook Stories, YouTube Community posts), we say so on that platform's page.",
          ]}
        />
      </Section>

      <Section title="Pick a platform">
        <Stagger className="grid gap-3 sm:grid-cols-2">
          {PLATFORM_SEO.map((p, i) => (
            <StaggerItem key={p.slug} index={i}>
              <Link
                href={`/platforms/${p.slug}`}
                className="group flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
              >
                <span className="text-[15px] font-bold text-[var(--text)]">
                  {PLATFORMS[p.key].label}
                </span>
                <span className="mt-1 flex-1 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  {p.tagline}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--primary)]">
                  Scheduling guide <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <CTA
        title="Connect your first platform in minutes"
        body="Free plan, three channels, no card. The queue starts working the moment you connect."
      />
    </main>
  );
}
