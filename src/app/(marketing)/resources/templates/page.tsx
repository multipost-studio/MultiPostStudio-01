import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, CTA } from "../../_components";
import { Stagger , StaggerItem} from "@/components/motion";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Templates" };

const TEMPLATES = [
  { name: "Educational carousel", cat: "Education", body: "Hook → 3 numbered points → save CTA. Consistently our best-performing format." },
  { name: "Product drop", cat: "Promo", body: "It's here → what makes it different → single clear CTA." },
  { name: "Behind the scenes", cat: "Story", body: "A short, honest look at how something got made." },
  { name: "Customer spotlight", cat: "Social proof", body: "Quote → result → light ask to try it." },
  { name: "Contrarian take", cat: "Engagement", body: "Unpopular opinion → the reasoning → invite disagreement." },
  { name: "Weekly roundup", cat: "Newsletter", body: "3–5 links with one line each, and why they matter." },
];

export default function TemplatesPage() {
  return (
    <main>
      <Hero eyebrow="Resources" title="Post templates" subtitle="Starting structures for every format. Copy one into your workspace and make it yours." />
      <Section>
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <StaggerItem key={t.name}>
              <div className="h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[16px] font-semibold text-[var(--text)]">{t.name}</p>
                  <Badge tone="neutral">{t.cat}</Badge>
                </div>
                <p className="mt-2 text-[14px] text-[var(--text-muted)]">{t.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>
      <CTA title="Use these in the composer" body="Every template is one click to a draft inside Cadence." action={{ label: "Start free", href: "/signup" }} />
    </main>
  );
}
