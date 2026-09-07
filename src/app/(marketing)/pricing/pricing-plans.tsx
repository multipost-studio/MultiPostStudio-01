"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/controls";
import { formatCurrency } from "@/lib/utils";
import { Stagger, StaggerItem } from "@/components/motion";

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

      <Stagger className="grid gap-4 lg:grid-cols-5">
        {plans.map((p) => {
          const price = inr
            ? interval === "year" ? p.priceAnnualInr : p.priceMonthlyInr
            : interval === "year" ? p.priceAnnual : p.priceMonthly;
          const suffix = interval === "year" ? "/yr" : "/mo";
          return (
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
                {p.key === "enterprise"
                  ? "Custom"
                  : price === 0
                    ? inr ? "₹0" : "$0"
                    : formatCurrency(price, inr ? "INR" : "USD")}
                {price > 0 && (
                  <span className="text-[13px] font-normal text-[var(--text-subtle)]">{suffix}</span>
                )}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-[13px] text-[var(--text-muted)]">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check size={14} className="mt-0.5 shrink-0 text-[var(--success)]" />
                    {f}
                  </li>
                ))}
              </ul>
              {(() => {
                const c = cta(p);
                return c.disabled ? (
                  <Button className="mt-5 w-full" variant="secondary" size="sm" disabled>
                    {c.label}
                  </Button>
                ) : (
                  <Button
                    asChild
                    className="mt-5 w-full"
                    variant={p.key === "team" ? "primary" : "secondary"}
                    size="sm"
                  >
                    <Link href={c.href}>{c.label}</Link>
                  </Button>
                );
              })()}
            </div>
            </StaggerItem>
          );
        })}
      </Stagger>
      {inr && (
        <p className="mt-4 text-center text-[13px] text-[var(--text-muted)]">
          Billed in Indian rupees at the price shown — no currency-conversion fee.
        </p>
      )}
    </>
  );
}
