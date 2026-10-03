import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero, Section, CTA, Breadcrumbs } from "../_components";
import { Stagger, StaggerItem } from "@/components/motion";
import { appUrl } from "@/lib/env";
import { COMPARISONS, LAST_VERIFIED } from "./_comparison-data";
import { KeyTakeaways } from "../_seo";

const baseUrl = appUrl().replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Comparisons & alternatives | MultiPost Studio",
  description:
    "Honest, sourced comparisons of MultiPost Studio vs Buffer and Hootsuite — pricing models, approvals, AI and who each tool fits. Competitor facts last verified October 2026.",
  alternates: { canonical: `${baseUrl}/comparisons` },
  openGraph: {
    title: "Comparisons & alternatives | MultiPost Studio",
    description: "Sourced comparisons: pricing, approvals, AI, best fit.",
    url: `${baseUrl}/comparisons`,
    type: "website",
  },
};

export default function ComparisonsIndexPage() {
  return (
    <main>
      <Breadcrumbs items={[{ name: "Comparisons", path: "/comparisons" }]} />
      <Hero
        eyebrow="Comparisons"
        title="How MultiPost Studio compares — honestly"
        subtitle="Sourced facts, fair framing, and who should pick which tool. No strawmen."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
      />

      <Section narrow>
        <KeyTakeaways
          points={[
            "The core trade-off: per-channel (Buffer) or per-seat (Hootsuite) billing versus flat per-workspace pricing.",
            "Every competitor fact cites the vendor's own page and carries a last-verified date — confirm before buying.",
            "The cheapest tool is the one matching your workflow: simple queues, enterprise breadth, or approval-centered teamwork.",
          ]}
        />
      </Section>

      <Section title="Head-to-head comparisons">
        <Stagger className="grid gap-3 sm:grid-cols-2">
          {COMPARISONS.map((c, i) => (
            <StaggerItem key={c.slug} index={i}>
              <Link
                href={`/comparisons/${c.slug}`}
                className="group flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
              >
                <span className="text-[16px] font-bold text-[var(--text)]">
                  MultiPost Studio vs {c.competitor}
                </span>
                <span className="mt-1 flex-1 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  {c.tagline}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--primary)]">
                  Read comparison <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
        <p className="mt-4 text-[12.5px] text-[var(--text-subtle)]">
          Competitor facts last verified {LAST_VERIFIED}. More comparisons ship as demand warrants — each one researched, never generated.
        </p>
      </Section>

      <CTA
        title="Compare by trying"
        body="Free plan, three channels, no trial clock. The fastest comparison is hands-on."
      />
    </main>
  );
}
