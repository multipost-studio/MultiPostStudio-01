import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, StatStrip, FeatureGrid, CTA } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Building2, Store } from "lucide-react";
import { CUSTOMERS } from "../_data";

export const metadata: Metadata = { title: "Customer stories" };

export default function CustomersPage() {
  return (
    <main>
      <Hero
        eyebrow="Customers"
        title="Teams that run on MultiPost Studio"
        subtitle="Different sizes, same problem: keep social consistent without it eating the week. Here's how a few of them do it."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
      />

      <Section bleed tone="mint">
        <StatStrip
          stats={[
            { value: "79,871", label: "customers" },
            { value: "62%", label: "less time on scheduling" },
            { value: "3.1×", label: "faster client sign-off" },
            { value: "4.9", label: "average rating" },
          ]}
        />
      </Section>

      <Section title="Read the stories">
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
        <div className="cad-block p-6">
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
