import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, CTA } from "../_components";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = {
  title: "Press",
  description: "Brand assets, boilerplate and contact information for media enquiries about MultiPost Studio.",
};

export default function PressPage() {
  return (
    <main>
      <Hero eyebrow="Company" title="Press & brand" subtitle="Assets, boilerplate and contact for media enquiries." />
      <Section narrow>
        <Reveal>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-[14px] font-semibold text-[var(--text)]">Boilerplate</p>
            <p className="mt-1 text-[15px] text-[var(--text-muted)]">
              MultiPost Studio is an AI-powered social media operating system that brings ideation, creation, planning,
              approvals, publishing, engagement and analytics into one workspace — with AI where it helps and
              human control where it matters. MultiPost Studio serves creators, small businesses, marketing teams,
              agencies and enterprises.
            </p>
          </div>
        </Reveal>

        <div className="mt-6 flex flex-wrap gap-2 text-[14px]">
          <Link href="/contact?topic=press" className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] hover:border-[var(--primary)] hover:underline">Logo pack (SVG + PNG)</Link>
          <Link href="/contact?topic=press" className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] hover:border-[var(--primary)] hover:underline">Product screenshots</Link>
        </div>
        <p className="mt-2 text-[13px] text-[var(--text-subtle)]">Request assets — we reply within 48 hours.</p>
        <p className="mt-4 text-[14px] text-[var(--text-muted)]">
          Media enquiries: <Link href="/contact" className="text-[var(--primary)] underline">multipoststudio@gmail.com</Link>
        </p>
      </Section>

      <Section bleed tone="rose" title="Brand basics" narrow>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Name", "Always “MultiPost Studio”, both words capitalised. Never “Multipost”, “MPS” or “MULTIPOST STUDIO”."],
            ["The mark", "The waveform bars and wordmark travel together. Don't recolour or rotate the bars."],
            ["Clear space", "Keep space equal to the mark's height on all sides. Minimum wordmark height: 20px."],
            ["Don't", "No drop shadows, no gradients on the logo, no stretching, no placing on busy photography."],
          ].map(([k, v]) => (
            <div key={k} className="mps-block p-4">
              <p className="text-[13px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">{k}</p>
              <p className="mt-1 text-[14.5px] font-medium leading-relaxed text-[var(--text-muted)]">{v}</p>
            </div>
          ))}
        </div>
      </Section>

      <CTA title="Writing about MultiPost Studio?" body="Ask for assets or more information — we'll get back to you." action={{ label: "Contact press", href: "/contact" }} />
    </main>
  );
}
