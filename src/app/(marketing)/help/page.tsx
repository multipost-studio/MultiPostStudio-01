import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, FAQ } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";
import { getFaqs } from "@/lib/cms";

export const metadata: Metadata = { title: "Help center" };

const CATEGORIES = [
  { title: "Getting started", body: "Signup, onboarding, connecting your first account.", href: "/guides/posting-schedule" },
  { title: "Composing & scheduling", body: "The composer, queues, calendar and auto-publish.", href: "/guides/content-pillars" },
  { title: "Approvals", body: "Flows, stages, locked versions and the audit trail.", href: "/guides/agency-onboarding" },
  { title: "Analytics & reports", body: "Dashboards, insights, the report builder and exports.", href: "/guides/content-pillars" },
  { title: "Team & permissions", body: "Roles, invites, workspace access and client seats.", href: "/guides/agency-onboarding" },
  { title: "Billing", body: "Plans, usage limits, invoices and cancellation.", href: "/pricing" },
];

const FAQS = [
  { q: "Does auto-publish work for every platform?", a: "Where the platform's API allows it, yes. For personal accounts that block automation (e.g. some Instagram setups) MultiPost Studio sends a reminder instead." },
  { q: "Can a client only see their own workspace?", a: "Yes. Add them as a Client workspace member — they'll see approvals and reports for that workspace only." },
  { q: "What happens when a scheduled post fails?", a: "MultiPost Studio retries automatically, then flags it in the queue with the error and a one-click retry. The team gets a notification." },
  { q: "Is my data used to train AI models?", a: "No. The Brand Brain is per-workspace context used only to condition your own generations." },
  { q: "Can I export everything?", a: "Analytics export to PDF/CSV, and Enterprise plans can export the full audit log." },
];

export default async function HelpPage() {
  const faqs = await getFaqs("help", FAQS);
  return (
    <main>
      <Hero eyebrow="Support" title="Help center" subtitle="Answers, how-tos and troubleshooting. Still stuck? Chat with us from inside the app." />
      <Section title="Browse by topic">
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <StaggerItem key={c.title}>
              <Link
                href={c.href}
                className="block h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--primary)]"
              >
                <p className="text-[16px] font-semibold text-[var(--text)]">{c.title}</p>
                <p className="mt-1 text-[14px] text-[var(--text-muted)]">{c.body}</p>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>
      <Section title="Frequently asked" narrow>
        <FAQ items={faqs} />
        <p className="mt-6 text-center text-[14px] text-[var(--text-muted)]">
          Can&apos;t find it? <Link href="/contact" className="text-[var(--primary)] underline">Contact support</Link>.
        </p>
      </Section>
    </main>
  );
}
