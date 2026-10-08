import type { Metadata } from "next";
import { Hero, Section, CTA, Breadcrumbs } from "../_components";
import { FaqExplorer } from "./faq-explorer";
import { getFaqs } from "@/lib/cms";
import { getPlans } from "@/lib/plans";
import { flags } from "@/lib/env";
import { FAQ_GROUPS, type FaqGroup } from "@/lib/faq/data";
import { buildPricingFaqs } from "@/lib/faq/plans";
import { withShareImage } from "@/lib/branding/metadata";

export const dynamic = "force-dynamic";

const TITLE = "Frequently asked questions";
const DESCRIPTION = "Answers about publishing, networks, AI, teams, approvals, pricing, security and your data: everything people ask before and after they start with MultiPost Studio.";

export async function generateMetadata(): Promise<Metadata> {
  return withShareImage({
    title: "FAQ",
    description: DESCRIPTION,
    alternates: { canonical: "/faq" },
    openGraph: { title: `${TITLE} · MultiPost Studio`, description: DESCRIPTION, url: "/faq", type: "website" },
  });
}

/** Static groups, with Pricing built from the live plans, and each group editable from Admin → Content (page "faq-<id>"). */
async function loadGroups(): Promise<FaqGroup[]> {
  const plans = await getPlans().catch(() => []);
  const inrEnabled = flags.billingProvider === "razorpay" && plans.some((p) => p.priceMonthlyInr > 0);
  const pricing: FaqGroup = {
    id: "pricing",
    title: "Pricing & billing",
    blurb: "Plans, trials, limits and how billing works.",
    items: plans.length ? buildPricingFaqs(plans, { inrEnabled }) : [],
  };
  const all = [FAQ_GROUPS[0], pricing, ...FAQ_GROUPS.slice(1)].filter((g) => g.items.length > 0);
  return Promise.all(all.map(async (g) => ({ ...g, items: await getFaqs(`faq-${g.id}`, g.items) })));
}

export default async function FaqPage() {
  const groups = await loadGroups();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((g) => g.items).map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <main>
      <Breadcrumbs items={[{ name: "FAQ", path: "/faq" }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Hero eyebrow="FAQ" title={TITLE} subtitle="Search below or pick a topic. Can't find it? Ask us and a person answers." primary={{ label: "Contact us", href: "/contact" }} secondary={{ label: "Start free", href: "/signup" }} />
      <Section>
        <FaqExplorer groups={groups} />
      </Section>
      <CTA title="Still have a question?" body="Ask us from the contact page, or send a ticket from inside the app and we'll see the page you were on." action={{ label: "Contact us", href: "/contact" }} />
    </main>
  );
}
