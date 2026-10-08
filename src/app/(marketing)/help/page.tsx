import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section } from "../_components";
import { PageFaq } from "../_page-faq";
import { Stagger , StaggerItem} from "@/components/motion";

export const metadata: Metadata = {
  title: "Help center",
  description: "Find answers, guides and support for using MultiPost Studio.",
};

const CATEGORIES = [
  { title: "Getting started", body: "Signup, onboarding, connecting your first account.", href: "/guides/posting-schedule" },
  { title: "Composing & scheduling", body: "The composer, queues, calendar and auto-publish.", href: "/guides/content-pillars" },
  { title: "Approvals", body: "Flows, stages, locked versions and the audit trail.", href: "/guides/agency-onboarding" },
  { title: "Analytics & reports", body: "Dashboards, insights, the report builder and exports.", href: "/guides/content-pillars" },
  { title: "Team & permissions", body: "Roles, invites, workspace access and client seats.", href: "/guides/agency-onboarding" },
  { title: "Billing", body: "Plans, usage limits, invoices and cancellation.", href: "/pricing" },
];

export default async function HelpPage() {
  return (
    <main>
      <Hero eyebrow="Support" title="Help center" subtitle="Answers, how-tos and troubleshooting. Still stuck? Open a support request from inside the app." />
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
      <PageFaq page="help" title="Frequently asked" />
    </main>
  );
}
