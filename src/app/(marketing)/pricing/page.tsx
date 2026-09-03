import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { getPlans } from "@/lib/plans";
import { getFaqs } from "@/lib/cms";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Hero, Section, FAQ } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";

export const metadata: Metadata = { title: "Pricing" };

const FAQS = [
  { q: "How does per-channel pricing work?", a: "Paid plans include a channel allowance. A channel is one connected social profile. Add more within your plan's cap; upgrade when you outgrow it." },
  { q: "Is there a free plan?", a: "Yes — one workspace, three channels, the composer, calendar, basic analytics and 20 AI credits a month. No card required." },
  { q: "Can I change plans anytime?", a: "Yes, up or down. Changes are prorated automatically." },
  { q: "What counts as an AI credit?", a: "Roughly one generation — a set of captions, a repurpose, a rewrite. Credits reset monthly." },
  { q: "Do you offer annual billing?", a: "Yes, and it saves about two months versus monthly." },
];

export default async function PricingPage() {
  const plans = await getPlans();
  const faqs = await getFaqs("pricing", FAQS);
  return (
    <main>
      <Hero
        eyebrow="Pricing"
        title="Simple, scalable pricing"
        subtitle="Start free. Upgrade when you add channels, seats or clients. Annual billing saves ~2 months."
      />

      <Section>
        <Stagger className="grid gap-4 lg:grid-cols-5">
          {plans.map((p) => (
            <StaggerItem key={p.key}>
              <div
                className={`flex h-full flex-col rounded-[var(--radius-lg)] border bg-[var(--surface)] p-5 ${
                  p.key === "team" ? "border-[var(--primary)] shadow-md" : "border-[var(--border)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[16px] font-semibold text-[var(--text)]">{p.name}</h2>
                  {p.key === "team" && <Badge tone="primary">Popular</Badge>}
                </div>
                <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                  {p.key === "enterprise" ? "Custom" : p.priceMonthly === 0 ? "$0" : formatCurrency(p.priceMonthly)}
                  {p.priceMonthly > 0 && <span className="text-[13px] font-normal text-[var(--text-subtle)]">/mo</span>}
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-[13px] text-[var(--text-muted)]">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check size={14} className="mt-0.5 shrink-0 text-[var(--success)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-5 w-full" variant={p.key === "team" ? "primary" : "secondary"} size="sm">
                  <Link href="/signup">{p.key === "enterprise" ? "Contact sales" : "Get started"}</Link>
                </Button>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section title="Questions" narrow>
        <FAQ items={faqs} />
      </Section>
    </main>
  );
}
