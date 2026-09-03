import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, FAQ, CTA } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";
import { getChangelog, getRoadmap } from "@/lib/cms";

export const metadata: Metadata = { title: "Roadmap" };

const COLS = [
  { key: "now" as const, title: "Now", tone: "var(--primary)" },
  { key: "next" as const, title: "Next", tone: "var(--info)" },
  { key: "later" as const, title: "Later", tone: "var(--text-subtle)" },
];

export default async function RoadmapPage() {
  const CHANGELOG = await getChangelog();
  const ROADMAP = await getRoadmap();
  return (
    <main>
      <Hero
        eyebrow="Company"
        title="What we're building"
        subtitle="A living view of where MultiPost Studio is headed. Priorities shift with what we learn from customers — this page is updated most weeks."
        primary={{ label: "Request a feature", href: "/contact" }}
        secondary={{ label: "Changelog", href: "/changelog" }}
      />

      <Section narrow>
        <div className="mps-block p-5 text-[15px] font-medium leading-relaxed text-[var(--text-muted)]">
          <p className="font-bold text-[var(--text)]">How this works</p>
          <p className="mt-1.5">
            <span className="font-semibold text-[var(--text)]">Now</span> is in active development and usually ships within a few weeks.{" "}
            <span className="font-semibold text-[var(--text)]">Next</span> is committed and scoped.{" "}
            <span className="font-semibold text-[var(--text)]">Later</span> is directional — we believe in it, but the shape may change. Nothing here is a delivery promise.
          </p>
        </div>
      </Section>

      <Section title="On the roadmap">
        <div className="grid gap-4 md:grid-cols-3">
          {COLS.map((c) => (
            <div key={c.key}>
              <p className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
                <span className="h-2 w-2 rounded-full" style={{ background: c.tone }} />
                {c.title}
              </p>
              <Stagger className="space-y-2">
                {ROADMAP[c.key].map((item) => (
                  <StaggerItem key={item}>
                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 text-[14px] text-[var(--text)]">
                      {item}
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          ))}
        </div>
      </Section>

      <Section bleed tone="rose" title="Recently shipped" intro="A sample of what's landed lately. The full history is on the changelog.">
        <Stagger className="space-y-3">
          {CHANGELOG.slice(0, 2).flatMap((rel) =>
            rel.items
              .filter((it) => it.type === "new")
              .map((it) => (
                <StaggerItem key={rel.version + it.text}>
                  <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
                    <span className="mt-0.5 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold uppercase text-[var(--primary)]">
                      v{rel.version}
                    </span>
                    <p className="text-[14.5px] font-medium leading-relaxed text-[var(--text)]">{it.text}</p>
                  </div>
                </StaggerItem>
              )),
          )}
        </Stagger>
        <p className="mt-5 text-[14px] text-[var(--text-muted)]">
          See everything on the <Link href="/changelog" className="font-semibold text-[var(--primary)] underline">changelog</Link>.
        </p>
      </Section>

      <Section title="Roadmap questions" narrow>
        <FAQ
          items={[
            { q: "Can I request a feature?", a: "Yes — use the contact form or in-app feedback. We tag requests and a lot of what ships starts there." },
            { q: "How often does this change?", a: "Most weeks. Items move between columns as scope firms up or priorities shift." },
            { q: "Is a dated item a promise?", a: "No. We avoid hard dates on purpose. Now items are the safest bet at a few weeks out." },
            { q: "Where's the mobile app?", a: "In Later. Native iOS and Android are planned; the web app is fully responsive in the meantime." },
          ]}
        />
      </Section>

      <CTA title="Have a strong opinion about what's next?" body="Tell us. Customer input drives most of what lands on this page." action={{ label: "Send feedback", href: "/contact" }} />
    </main>
  );
}
