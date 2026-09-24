import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, StatStrip, FeatureGrid, CTA } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Building2, Store } from "lucide-react";
import { getCustomers } from "@/lib/cms";

export const metadata: Metadata = { title: "Customer stories" };

export default async function CustomersPage() {
  const CUSTOMERS = await getCustomers();
  return (
    <main>
      <Hero
        eyebrow="Workflows"
        title="How high-performing teams run on MultiPost Studio"
        subtitle="From solo creators to multi-client agencies: keep social media publishing consistent, compliant, and collaborative without juggling ten browser tabs."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
      />

      <Section bleed tone="mint">
        <StatStrip
          stats={[
            { value: "9", label: "supported networks" },
            { value: "100%", label: "direct API publishing" },
            { value: "0", label: "sign-off bottlenecks" },
            { value: "24/7", label: "automated queue execution" },
          ]}
        />
      </Section>

      <Section title="Workflow playbooks">
        <Stagger className="grid gap-4 md:grid-cols-3">
          {CUSTOMERS.map((c) => (
            <StaggerItem key={c.slug}>
              <Link
                href={`/customers/${c.slug}`}
                className="flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--primary)]"
              >
                <Badge tone="neutral">{c.industry}</Badge>
                <p className="mt-3 flex-1 text-[15px] text-[var(--text)]">&ldquo;{c.quote}&rdquo;</p>
                <p className="mt-3 text-[13px] text-[var(--text-subtle)]">{c.person}</p>
                <p className="mt-1 text-[14px] font-semibold text-[var(--primary)]">{c.result}</p>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section bleed tone="rose" title="Common patterns" intro="Across every size, the same three shifts show up.">
        <FeatureGrid
          items={[
            { icon: <Sparkles size={17} />, title: "Batching replaces daily posting", body: "Teams plan a week or a month in one sitting, then let the queue drip it out. The daily scramble disappears.", href: "/solutions/creators" },
            { icon: <Store size={17} />, title: "One inbox replaces tab-switching", body: "Comments, DMs and reviews land in a single place, so nothing waits days for a reply.", href: "/features/engagement" },
            { icon: <Building2 size={17} />, title: "Reports replace status meetings", body: "White-label PDFs and shareable links go out automatically — clients and execs stop asking “how's social going?”.", href: "/solutions/agencies" },
          ]}
        />
      </Section>

      <Section title="Want to be featured?" narrow>
        <div className="mps-block p-6">
          <p className="text-[15px] font-medium leading-relaxed text-[var(--text-muted)]">
            If MultiPost Studio changed how your team works, we&apos;d love to write it up — 30 minutes of your time,
            a draft you approve, and a link you can share.{" "}
            <Link href="/contact" className="font-semibold text-[var(--primary)] underline">Get in touch</Link>.
          </p>
        </div>
      </Section>

      <CTA />
    </main>
  );
}
