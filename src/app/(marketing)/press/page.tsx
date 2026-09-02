import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, CTA } from "../_components";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

export const metadata: Metadata = { title: "Press" };

const FACTS = [
  ["Founded", "2024"],
  ["Team", "~20, fully remote"],
  ["HQ", "Distributed"],
  ["Funding", "Seed, bootstrapped growth"],
];

export default function PressPage() {
  return (
    <main>
      <Hero eyebrow="Company" title="Press & brand" subtitle="Assets, boilerplate and contact for media enquiries." />
      <Section narrow>
        <Reveal>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-[14px] font-semibold text-[var(--text)]">Boilerplate</p>
            <p className="mt-1 text-[15px] text-[var(--text-muted)]">
              Cadence is an AI-powered social media operating system that brings ideation, creation, planning,
              approvals, publishing, engagement and analytics into one workspace — with AI where it helps and
              human control where it matters. Cadence serves creators, small businesses, marketing teams,
              agencies and enterprises.
            </p>
          </div>
        </Reveal>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FACTS.map(([k, v]) => (
            <div key={k} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-[12px] uppercase tracking-wide text-[var(--text-subtle)]">{k}</p>
              <p className="mt-0.5 text-[15px] font-semibold text-[var(--text)]">{v}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-[14px]">
          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text-muted)]">Logo pack (SVG + PNG)</span>
          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text-muted)]">Product screenshots</span>
          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text-muted)]">Founder headshots</span>
        </div>
        <p className="mt-4 text-[14px] text-[var(--text-muted)]">
          Media enquiries: <Link href="/contact" className="text-[var(--primary)] underline">press@cadence.example</Link>
        </p>
      </Section>

      <Section bleed tone="rose" title="Brand basics" narrow>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Name", "Always “Cadence”, capital C. Never “cadence” or “CADENCE”."],
            ["The mark", "The waveform bars and wordmark travel together. Don't recolour or rotate the bars."],
            ["Clear space", "Keep space equal to the mark's height on all sides. Minimum wordmark height: 20px."],
            ["Don't", "No drop shadows, no gradients on the logo, no stretching, no placing on busy photography."],
          ].map(([k, v]) => (
            <div key={k} className="cad-block p-4">
              <p className="text-[13px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">{k}</p>
              <p className="mt-1 text-[14.5px] font-medium leading-relaxed text-[var(--text-muted)]">{v}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Founders">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Avery Quinn", "CEO", "Previously led social at two consumer brands. Started Cadence after rebuilding the same spreadsheet workflow for the fifth time."],
            ["Leo Marchetti", "CTO", "Ex-infrastructure engineer. Owns the publishing engine, the adapters and the parts that must never drop a post."],
          ].map(([n, r, b]) => (
            <div key={n} className="cad-block p-5">
              <p className="text-[16px] font-bold text-[var(--text)]">{n}</p>
              <p className="text-[13px] font-bold uppercase tracking-wide text-[var(--primary)]">{r}</p>
              <p className="mt-2 text-[14.5px] font-medium leading-relaxed text-[var(--text-muted)]">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section bleed tone="mint" title="Coverage">
        <Stagger className="space-y-2">
          {[
            ["The Publish Weekly", "“Cadence bets the whole workflow, not just scheduling”", "Aug 2026"],
            ["Creator Stack", "How a 20-person team ships a full social OS", "Jul 2026"],
            ["SaaS Notes", "Building in the open: Cadence's public metrics", "Jun 2026"],
          ].map(([outlet, headline, when]) => (
            <StaggerItem key={String(headline)}>
              <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
                <div>
                  <p className="text-[14.5px] font-semibold text-[var(--text)]">{headline}</p>
                  <p className="text-[13px] text-[var(--text-subtle)]">{outlet} · {when}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        <p className="mt-4 text-[13px] text-[var(--text-subtle)]">Illustrative — this is a demo product.</p>
      </Section>

      <CTA title="Writing about Cadence?" body="Ask for assets, quotes or a founder call — we usually turn press requests around in 48 hours." action={{ label: "Contact press", href: "/contact" }} />
    </main>
  );
}
