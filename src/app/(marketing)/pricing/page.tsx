import type { Metadata } from "next";
import { getPlans } from "@/lib/plans";
import { getWorkspaceContext } from "@/lib/session";
import { logger } from "@/lib/logger";
import { buildPricingFaqs } from "@/lib/faq/plans";
import { flags } from "@/lib/env";
import { Hero, Section } from "../_components";
import { PageFaq } from "../_page-faq";
import { PricingPlans, type PricingPlan } from "./pricing-plans";
import { FeatureComparison } from "./feature-comparison";
import { IncludedInEveryPlan, SecurityStrip, TrustChips } from "./pricing-extras";
import { everyPlanItems } from "./pricing-format";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, transparent pricing for MultiPost Studio — plans for creators, small teams and agencies.",
};
// Reads cookies via getWorkspaceContext below, which already forces dynamic
// rendering — this just makes it explicit instead of relying on Next's
// inference, silencing the build's dynamic-usage notice for this route.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const plans = await getPlans();
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
      limits: { workspaces: p.maxWorkspaces, channels: p.maxChannels, users: p.maxUsers, scheduled: p.maxScheduled, aiCredits: p.aiCredits, storageMb: p.storageMb },
    };
  });
  // Only Razorpay actually charges in INR, so don't advertise a price we can't take.
  const inrEnabled = flags.billingProvider === "razorpay" && priced.some((p) => p.priceMonthlyInr > 0);
  // The entry plan defines what everyone gets; read from its real entitlements.
  const entry = [...plans].sort((a, b) => a.sortIndex - b.sortIndex)[0];
  const everyPlan = everyPlanItems(entry?.entitlements ?? []);
  return (
    <main>
      <Hero
        eyebrow="Pricing"
        title="Simple, honest pricing"
        subtitle={`Start free, no card needed. Paid plans raise your limits and unlock team features, deeper analytics and automation. Pay monthly or yearly${inrEnabled ? ", in US dollars worldwide or in rupees in India" : ""}. Yearly saves about two months.`}
      />

      <Section>
        <PricingPlans
          plans={priced}
          inrEnabled={inrEnabled}
          signedIn={!!ctx}
          currentPlanKey={currentPlanKey}
        />
        <TrustChips showCurrency={inrEnabled} />
      </Section>

      {everyPlan.length > 0 && (
        <Section title="Included in every plan">
          <IncludedInEveryPlan items={everyPlan} />
        </Section>
      )}

      <Section title="Compare every plan">
        {/* Built from the same Plan rows as the cards above — entitlements and
            limits, not a hand-maintained list that can drift from them. */}
        <FeatureComparison plans={plans.filter((p) => p.isPublic)} />
      </Section>

      <Section title="Your data stays safe">
        <SecurityStrip />
      </Section>

      {/* Built from the live plans, so every number and trial length is what /admin/plans says. */}
      <PageFaq page="pricing" title="Pricing questions" seed={buildPricingFaqs(plans, { inrEnabled })} />
    </main>
  );
}
