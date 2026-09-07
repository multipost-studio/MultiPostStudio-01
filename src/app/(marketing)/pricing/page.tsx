import type { Metadata } from "next";
import { getPlans } from "@/lib/plans";
import { getWorkspaceContext } from "@/lib/session";
import { logger } from "@/lib/logger";
import { getFaqs } from "@/lib/cms";
import { flags } from "@/lib/env";
import { Hero, Section, FAQ } from "../_components";
import { PricingPlans, type PricingPlan } from "./pricing-plans";
import { FeatureComparison } from "./feature-comparison";

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
  // Null for signed-out visitors — getWorkspaceContext does not redirect, so a
  // public page can read subscription state safely.
  //
  // Wrapped because this is the PUBLIC pricing page: personalising the CTA is a
  // nicety, and a session/DB problem must never take pricing off the internet.
  // On failure every visitor simply sees the signed-out CTAs.
  const ctx = await getWorkspaceContext().catch((err) => {
    logger.error({ err }, "pricing: session lookup failed — rendering signed-out CTAs");
    return null;
  });
  const currentPlanKey = ctx?.active?.subscription?.plan.key ?? null;

  // Every price — USD and INR — comes from the Plan table, so /admin/plans is
  // the single authority and the two currencies cannot drift apart.
  const priced: PricingPlan[] = plans.map((p) => {
    return {
      key: p.key,
      name: p.name,
      features: p.features,
      priceMonthly: p.priceMonthly,
      priceAnnual: p.priceAnnual,
      priceMonthlyInr: p.priceMonthlyInr,
      priceAnnualInr: p.priceAnnualInr,
      sortIndex: p.sortIndex,
      isCustom: p.isCustom,
    };
  });
  // Only Razorpay actually charges in INR, so don't advertise a price we can't take.
  const inrEnabled = flags.billingProvider === "razorpay" && priced.some((p) => p.priceMonthlyInr > 0);
  return (
    <main>
      <Hero
        eyebrow="Pricing"
        title="Simple, scalable pricing"
        subtitle="Start free. Upgrade when you add channels, seats or clients. Annual billing saves ~2 months."
      />

      <Section>
        <PricingPlans
          plans={priced}
          inrEnabled={inrEnabled}
          signedIn={!!ctx}
          currentPlanKey={currentPlanKey}
        />
      </Section>

      <Section title="Compare every plan">
        {/* Built from the same Plan rows as the cards above — entitlements and
            limits, not a hand-maintained list that can drift from them. */}
        <FeatureComparison plans={plans.filter((p) => p.isPublic)} />
      </Section>

      <Section title="Questions" narrow>
        <FAQ items={faqs} />
      </Section>
    </main>
  );
}
