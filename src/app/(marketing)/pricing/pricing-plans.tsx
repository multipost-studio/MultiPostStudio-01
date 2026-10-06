"use client";

import * as React from "react";
import { Segmented } from "@/components/ui/controls";
import { formatCurrency } from "@/lib/utils";
import { EnterpriseBanner, PricingCard } from "./pricing-card";
import { limitStats, PLAN_BLURB, planHighlights, type PlanLimits } from "./pricing-format";

// Colorful flat tariff-card tones, one per plan tier (cycles if there are
// more plans than tones). The "Popular" plan keeps var(--surface) — its
// primary-colored border/shadow is the distinguishing signal instead, so it
// doesn't compete with its own card tone.
const PLAN_TONES = ["var(--block-rose)", "var(--block-blue)", "var(--block-violet)", "var(--block-amber)", "var(--block-mint)"];

export type PricingPlan = {
  key: string;
  name: string;
  features: string[];
  priceMonthly: number;
  priceAnnual: number;
  /** Native local price, not an FX conversion — see PLAN_CATALOG. 0 when the
   *  plan has no paid INR equivalent (free/enterprise). */
  priceMonthlyInr: number;
  priceAnnualInr: number;
  /** Ordering decides whether another plan is an upgrade or a downgrade. */
  sortIndex: number;
  isCustom: boolean;
  limits: PlanLimits;
};

/**
 * The public pricing grid.
 *
 * Previously this rendered monthly USD only, which had two problems: the page
 * subtitle promises "annual billing saves ~2 months" with no way to see annual
 * prices, and visitors paying in rupees saw dollars until after signup — even
 * though checkout charges a real INR price with no conversion fee. Both
 * toggles mirror the ones on /settings/billing so the number a prospect sees
 * here is the number they are charged.
 */
export function PricingPlans({
  plans,
  inrEnabled,
  signedIn,
  currentPlanKey,
}: {
  plans: PricingPlan[];
  inrEnabled: boolean;
  signedIn: boolean;
  /** Null when signed out or on no plan; drives the per-card CTA. */
  currentPlanKey: string | null;
}) {
  const current = plans.find((p) => p.key === currentPlanKey) ?? null;

  /**
   * The CTA must never promise something the viewer's state contradicts —
   * offering "Get started" to an existing Team customer, or "Upgrade" for a
   * cheaper plan. Signed-out visitors always get the signup path.
   */
  function cta(p: PricingPlan): { label: string; href: string; disabled: boolean } {
    if (p.isCustom || p.key === "enterprise") {
      return { label: "Contact sales", href: "/contact", disabled: false };
    }
    if (!signedIn) return { label: "Get started", href: "/signup", disabled: false };
    if (current && p.key === current.key) {
      return { label: "Current plan", href: "/settings/billing", disabled: true };
    }
    const dir = current && p.sortIndex < current.sortIndex ? "Downgrade" : "Upgrade";
    return { label: `${dir} to ${p.name}`, href: "/settings/billing", disabled: false };
  }

  const [interval, setInterval] = React.useState<"month" | "year">("month");
  // Match the billing page: when INR is available the provider is Razorpay,
  // which settles in rupees — showing dollars first sends Indian visitors to a
  // USD subscription and an avoidable FX markup.
  const [currency, setCurrency] = React.useState<"usd" | "inr">(inrEnabled ? "inr" : "usd");
  const inr = inrEnabled && currency === "inr";

  // Enterprise is a conversation, not a price: it gets a banner under the cards.
  const enterprise = plans.find((p) => p.key === "enterprise") ?? null;
  const cards = plans.filter((p) => p.key !== "enterprise");

  // Both price lists are real (INR is a native price, not an FX conversion), so show the one not selected too.
  function altLabel(p: PricingPlan): string | null {
    if (!inrEnabled) return null;
    const usd = interval === "year" ? p.priceAnnual : p.priceMonthly;
    const rupees = interval === "year" ? p.priceAnnualInr : p.priceMonthlyInr;
    const per = interval === "year" ? "year" : "month";
    if (inr) return usd > 0 ? `${formatCurrency(usd, "USD")}/${per} if you're billed outside India` : null;
    return rupees > 0 ? `${formatCurrency(rupees, "INR")}/${per} if you bill in India. The actual INR price, not a conversion.` : null;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
        <Segmented
          value={interval}
          onChange={(v) => setInterval(v as "month" | "year")}
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: "Annual (2 months free)" },
          ]}
        />
        {inrEnabled && (
          <Segmented
            value={currency}
            onChange={(v) => setCurrency(v as "usd" | "inr")}
            options={[
              { value: "usd", label: "$ USD" },
              { value: "inr", label: "₹ INR" },
            ]}
          />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((p, i) => {
          const monthlyPrice = inr ? p.priceMonthlyInr : p.priceMonthly;
          const annualPrice = inr ? p.priceAnnualInr : p.priceAnnual;
          return (
            <PricingCard
              key={p.key}
              index={i}
              name={p.name}
              blurb={PLAN_BLURB[p.key] ?? null}
              stats={limitStats(p.limits)}
              highlights={planHighlights(p.features)}
              inheritsFrom={i > 0 ? cards[i - 1].name : null}
              price={interval === "year" ? annualPrice : monthlyPrice}
              monthlyPrice={monthlyPrice}
              annualPrice={annualPrice}
              altPriceLabel={altLabel(p)}
              interval={interval}
              inr={inr}
              popular={p.key === "team"}
              isCurrent={signedIn && current?.key === p.key}
              tone={PLAN_TONES[i % PLAN_TONES.length]}
              cta={cta(p)}
            />
          );
        })}
      </div>
      {enterprise && (
        <EnterpriseBanner name={enterprise.name} blurb={PLAN_BLURB.enterprise} features={planHighlights(enterprise.features)} cta={cta(enterprise)} />
      )}
      {inr && (
        <p className="mt-4 text-center text-[13px] text-[var(--text-muted)]">
          Billed in Indian rupees at the price shown, with no currency-conversion fee.
        </p>
      )}
    </>
  );
}
