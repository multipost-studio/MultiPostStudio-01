import { ENTITLEMENT_GROUPS } from "@/lib/constants";
import type { PlanRow } from "@/lib/plans";
import type { FaqItem } from "./data";

/**
 * Pricing & billing answers built from the live plan rows, so every number and trial length
 * is whatever /admin/plans says right now. Pure: no database, no currency formatting (prices
 * live on the pricing page itself; the FAQ explains how pricing works, not what it costs).
 */

const NETWORK_LABEL = new Map<string, string>();
for (const group of ENTITLEMENT_GROUPS) {
  for (const [key, label] of group.items as readonly (readonly [string, string])[]) {
    if (key.startsWith("platform_")) NETWORK_LABEL.set(key, label);
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const count = (n: number, one: string) => (n === 0 ? `unlimited ${one}s` : plural(n, one));

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function networksOf(plan: PlanRow): string[] {
  return plan.entitlements.filter((e) => NETWORK_LABEL.has(e)).map((e) => NETWORK_LABEL.get(e)!);
}

/** Public, self-serve plans in display order. */
function publicPlans(plans: readonly PlanRow[]): PlanRow[] {
  return [...plans].filter((p) => p.isPublic).sort((a, b) => a.sortIndex - b.sortIndex);
}

export function buildPricingFaqs(plans: readonly PlanRow[], opts: { inrEnabled: boolean }): FaqItem[] {
  const shown = publicPlans(plans);
  const free = shown.find((p) => p.priceMonthly === 0 && !p.isCustom);
  const paid = shown.filter((p) => p !== free && !p.isCustom);
  const custom = shown.find((p) => p.isCustom || (p.priceMonthly === 0 && p !== free));
  const items: FaqItem[] = [];

  if (free) {
    items.push({
      q: "Is there a free plan?",
      a: `Yes. ${free.name} gives you ${count(free.maxWorkspaces, "workspace")}, ${plural(free.maxChannels, "channel")}, the composer and calendar, basic analytics and ${free.aiCredits.toLocaleString("en-US")} AI credits a month. No card required, and it doesn't expire.`,
    });
  }

  if (shown.length > 0) {
    const lines = shown.filter((p) => !p.isCustom && p.maxChannels > 0).map((p) => `${p.name} includes ${plural(p.maxChannels, "channel")}`);
    items.push({
      q: "How do channels, workspaces and seats count?",
      a: `A channel is one connected social profile, Page or location. Each plan sets how many channels, workspaces and teammates you get${lines.length ? ` (${list(lines)})` : ""}. Add more within your plan's allowance and upgrade when you outgrow it.`,
    });
  }

  if (free) {
    const base = new Set(networksOf(free));
    const extras = paid.length ? networksOf(paid[0]).filter((n) => !base.has(n)) : [];
    if (base.size > 0) {
      items.push({
        q: "Which social networks are on which plan?",
        a: `${free.name} covers ${list([...base])}.${extras.length ? ` ${paid[0].name} and above add ${list(extras)}.` : ""} The comparison table on this page shows every plan side by side.`,
      });
    }
  }

  // Paid plans have no timed trial: Plan.trialDays exists but checkout doesn't use it, so nothing here may promise one.
  items.push({
    q: "Can I try a paid plan before paying?",
    a: "There's no timed trial of the paid plans. The free plan is the way to try the product, and it doesn't expire. A paid plan starts when you choose it at checkout.",
  });

  items.push({
    q: "Can I change plans anytime?",
    a: "Yes, up or down from Settings → Billing. The new plan starts today at its full price, and the plan you're on now stops renewing at the end of the period you've already paid for, so you're not charged for it again.",
  });

  const withDiscount = paid.find((p) => p.annualDiscountPct > 0);
  if (withDiscount) {
    const monthsFree = Math.round((12 * withDiscount.annualDiscountPct) / 100);
    items.push({
      q: "Do you offer annual billing?",
      a: `Yes. Paying yearly is discounted by about ${withDiscount.annualDiscountPct}%${monthsFree >= 1 ? `, roughly ${monthsFree} month${monthsFree === 1 ? "" : "s"} free` : ""}, and you can switch interval from Settings → Billing.`,
    });
  }

  const withCredits = shown.filter((p) => !p.isCustom && p.aiCredits > 0);
  items.push({
    q: "What counts as an AI credit?",
    a: `Roughly one generation: a set of captions, a repurpose or a rewrite. Credits reset every month${withCredits.length ? ` (${list(withCredits.map((p) => `${p.name} ${p.aiCredits.toLocaleString("en-US")}`))} a month)` : ""}. If you connect your own AI key under Settings → AI Providers, you're using your own account with that provider.`,
  });

  items.push({
    q: "What happens when I reach a limit?",
    a: "Everything you already have keeps working. MultiPost Studio asks you to upgrade before you add the next channel, workspace or teammate beyond your plan's allowance.",
  });

  items.push({
    q: "Which currency am I billed in?",
    a: opts.inrEnabled
      ? "You choose US dollars or Indian rupees at checkout. The two are separate price lists, not one converted into the other, so the price you see is the price you pay."
      : "Prices are in US dollars, and the price you see is the price you pay.",
  });

  items.push({
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from Settings → Billing whenever you like; cancelling stops future charges, and you can reactivate later. Your invoices stay available there too.",
  });

  items.push({ q: "I have a coupon code.", a: "Redeem it in Settings → Billing, in the coupon box under your plan." });

  items.push({
    q: "Who do I ask about a charge or a refund?",
    a: "Contact support from inside the app (Settings → Support) or the contact page and include your invoice number. Billing questions are answered by a person.",
  });

  if (custom) {
    items.push({
      q: `What is the ${custom.name} plan?`,
      a: `${custom.name} is arranged with our team: custom channels and seats, audit exports and dedicated support. Single sign-on and SCIM requirements are scoped with you directly, so tell us about your identity provider up front. Use the contact page to start.`,
    });
  }

  items.push({
    q: "How do you compare to Buffer or Hootsuite?",
    a: "We keep sourced, fairly framed comparisons on our comparisons page, including how per-channel, per-seat and flat workspace pricing differ for your setup.",
  });

  return items;
}
