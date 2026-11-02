import type { Metadata } from "next";
import { scheduledCapacity } from "@/lib/scheduled-limit";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getUsage } from "@/lib/adapters/billing";
import { flags } from "@/lib/env";
import { describeSubscription } from "@/lib/billing-rules";
import { formatCurrency, formatDate, parseJson } from "@/lib/utils";
import { Progress } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "../_form";
import { PlanPicker, CancelButton, ReactivateButton, BillingDetailsForm, RedeemCouponForm } from "./billing-client";

export const metadata: Metadata = { title: "Billing" };

/** Plan key from the URL rendered as a name: "pro" -> "Pro". Strips anything
 *  that isn't a letter first, since it is echoed into the page. */
function titleCase(raw: string): string {
  const clean = raw.replace(/[^a-z]/gi, "").slice(0, 20).toLowerCase();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : "";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string; plan?: string; feature?: string }>;
}) {
  const ctx = await requireWorkspace();
  // `plan` and `feature` arrive from a locked nav item, so the page can answer
  // the question that click asked instead of showing a bare plan grid.
  const { changed, plan: wantPlan, feature } = await searchParams;
  const orgId = ctx.active.org.id;
  // Billing is org-scoped — check the org membership role, not the
  // workspace-effective role (a workspace `manager` is not an org admin).
  const canManage = can(ctx.active.orgRole, "billing.manage");

  const [sub, invoices, usage, plans, org] = await Promise.all([
    db.subscription.findUnique({ where: { orgId }, include: { plan: true } }),
    db.invoice.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 10 }),
    getUsage(orgId),
    db.plan.findMany({ orderBy: { sortIndex: "asc" } }),
    db.organization.findUniqueOrThrow({ where: { id: orgId } }),
  ]);

  // What the account is entitled to RIGHT NOW comes from the same rule that gates every feature, not
  // from which plan the row points at: a cancelled or overdue plan whose time has run out is Free here
  // just as it is everywhere else.
  const rowPlan = plans.find((p) => p.id === sub?.planId);
  const view = describeSubscription(sub, rowPlan?.key);
  const currentPlan = plans.find((p) => p.key === view.effectivePlanKey) ?? rowPlan;
  const daysLeft = (d: Date | null) => (d ? Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000)) : 0);

  // Plans a customer can pick: the public ones, plus their own if it is hidden.
  const pickable = plans.filter((p) => p.isPublic || p.key === currentPlan?.key);
  const yearly = pickable.find((p) => p.annualDiscountPct > 0 && p.priceAnnual > 0);
  const monthsFree = yearly ? Math.round((12 * yearly.annualDiscountPct) / 100) : 0;
  const annualLabel = monthsFree >= 1 ? `Annual (${monthsFree} month${monthsFree === 1 ? "" : "s"} free)` : "Annual";

  type Meter = { label: string; used: number; limit: number; unmetered?: boolean };
  const meters: Meter[] = currentPlan
    ? [
        { label: "Social accounts", used: usage.channels, limit: currentPlan.maxChannels },
        { label: "Team members", used: usage.users, limit: currentPlan.maxUsers },
        // The limit is per channel; what the org may hold in total is that limit for each connected channel.
        { label: currentPlan.maxScheduled > 0 ? `Scheduled posts (${currentPlan.maxScheduled} per channel)` : "Scheduled posts", used: usage.scheduled_posts, limit: scheduledCapacity(currentPlan.maxScheduled, usage.channels) },
        { label: "AI credits (this month)", used: usage.ai_credits, limit: currentPlan.aiCredits },
        { label: "Storage (MB)", used: usage.storage_mb, limit: currentPlan.storageMb },
        // Plans cap API requests per minute, not per month, so there is no monthly limit to draw a bar against.
        { label: "API calls (this month)", used: usage.api_calls, limit: 0, unmetered: true },
      ]
    : [];
  const overLimit = meters.filter((m) => !m.unmetered && m.limit > 0 && m.used > m.limit);

  return (
    <>
      {/* Both values are echoed into text, so they are bounded and stripped of
          anything that isn't a plain name before rendering. */}
      {feature && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-2.5 text-[14px] text-[var(--text)]">
          <strong>{feature.replace(/[^\w\s&-]/g, "").slice(0, 40)}</strong>
          {wantPlan
            ? ` is included in ${titleCase(wantPlan)} and above.`
            : " needs a higher plan."}{" "}
          Pick a plan below to start using it.
        </p>
      )}

      {changed && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 text-[14px] text-[var(--success)]">
          Plan updated.
        </p>
      )}

      {view.state === "trialing" && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--info)] bg-[var(--info-soft)] px-3 py-2 text-[14px] text-[var(--info)]">
          Trial: <strong>{daysLeft(view.endsOn)} day{daysLeft(view.endsOn) === 1 ? "" : "s"}</strong> left
          {view.endsOn ? ` (ends ${formatDate(view.endsOn)})` : ""}. Add a payment method before it ends to keep {currentPlan?.name}.
        </p>
      )}
      {view.state === "canceled_pending" && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-[14px] text-[var(--warning)]">
          Your {currentPlan?.name} plan is cancelled and won&apos;t renew. You keep it until {view.endsOn ? formatDate(view.endsOn) : "the end of the period you've paid for"}, then your account moves to Free.
        </p>
      )}
      {view.state === "past_due" && (
        <p role="alert" className="mb-4 rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[14px] text-[var(--danger)]">
          We couldn&apos;t collect your last payment. {currentPlan?.name} stays on until {view.endsOn ? formatDate(view.endsOn) : "the grace period ends"}; after that your account moves to Free. Update your payment method with your provider, or choose the plan again below.
        </p>
      )}
      {view.state === "expired" && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--text-muted)]">
          Your {rowPlan?.name} plan has ended and your account is on Free{view.endsOn ? ` (since ${formatDate(view.endsOn)})` : ""}. Choose a plan below to pick up where you left off.
        </p>
      )}
      {overLimit.length > 0 && (
        <p role="status" className="mb-4 rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-[14px] text-[var(--warning)]">
          You&apos;re over your {currentPlan?.name} limit on {overLimit.map((m) => m.label.toLowerCase()).join(", ")}. Nothing has been deleted, but you can&apos;t add more of {overLimit.length === 1 ? "it" : "those"} until you&apos;re back under the limit or move to a larger plan.
        </p>
      )}

      <SettingsSection title="Current plan" description="Your subscription and renewal.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[17px] font-semibold text-[var(--text)]">
              {currentPlan?.name ?? "Free"}{" "}
              <Badge tone={view.state === "active" ? "success" : view.state === "trialing" ? "info" : view.state === "free" ? "neutral" : view.state === "canceled_pending" ? "warning" : "danger"}>
                {{ free: "Free", active: "Active", trialing: "Trial", canceled_pending: "Cancelled", past_due: "Payment overdue", expired: "Ended" }[view.state]}
              </Badge>
            </p>
            <p className="text-[13px] text-[var(--text-subtle)]">
              {view.renewsOn
                ? `Renews ${formatDate(view.renewsOn)} · ${sub?.interval === "year" ? "billed annually" : "billed monthly"}`
                : view.state === "canceled_pending" && view.endsOn
                  ? `Ends ${formatDate(view.endsOn)} · no further charges`
                  : view.state === "past_due"
                    ? "Payment overdue"
                    : "No renewal"}
            </p>
          </div>
          {canManage && view.state === "canceled_pending" && <ReactivateButton />}
          {canManage && (view.state === "active" || view.state === "trialing" || view.state === "past_due") && <CancelButton />}
        </div>
      </SettingsSection>

      <SettingsSection title="Usage" description="AI credits and API calls count from the start of each calendar month. The other meters show what you have right now.">
        <div className="space-y-3">
          {meters.map((m) => {
            const pct = m.limit > 0 ? Math.min(100, (m.used / m.limit) * 100) : 0;
            return (
              <div key={m.label}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--text-muted)]">{m.label}</span>
                  <span className={pct > 90 ? "font-medium text-[var(--danger)]" : "text-[var(--text)]"}>
                    {m.unmetered ? m.used.toLocaleString() : `${m.used.toLocaleString()} / ${m.limit > 0 ? m.limit.toLocaleString() : "Unlimited"}`}
                  </span>
                </div>
                {!m.unmetered && m.limit > 0 && <Progress value={pct} className="mt-1" />}
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {canManage && (
        <SettingsSection title="Change plan" description="Switch any time. The new plan starts today at its full price, and the plan you're on now stops renewing at the end of the period you've already paid for.">
          <PlanPicker
            currentKey={(currentPlan?.key as string) ?? "free"}
            highlightKey={wantPlan}
            annualLabel={annualLabel}
            realBilling={flags.realBilling}
            razorpayEnabled={flags.billingProvider === "razorpay"}
            plans={pickable.map((p) => {
              return {
                key: p.key,
                name: p.name,
                priceMonthly: p.priceMonthly,
                priceAnnual: p.priceAnnual,
                priceMonthlyInr: p.priceMonthlyInr,
                priceAnnualInr: p.priceAnnualInr,
                features: parseJson<string[]>(p.features, []),
              };
            })}
          />
        </SettingsSection>
      )}

      {canManage && (
        <SettingsSection
          title="Credit & coupons"
          description={
            [
              org.creditBalance > 0 && flags.billingProvider !== "razorpay" ? `Account credit: ${formatCurrency(org.creditBalance)}, applied when you next start or change a plan.` : "",
              sub && sub.discountPct > 0 ? `Active discount: ${sub.discountPct}% off (${sub.couponCode}), applied when you next start or change a plan.` : "",
            ]
              .filter(Boolean)
              .join(" ") || "Redeem a promo or credit code."
          }
        >
          <RedeemCouponForm />
        </SettingsSection>
      )}

      {canManage && (
        <SettingsSection title="Billing details" description="Appears on every invoice and receipt.">
          <BillingDetailsForm
            initial={{
              billingName: org.billingName ?? "",
              billingEmail: org.billingEmail ?? "",
              billingAddress: org.billingAddress ?? "",
              billingCountry: org.billingCountry ?? "",
              taxId: org.taxId ?? "",
            }}
          />
        </SettingsSection>
      )}

      {canManage ? (
        <SettingsSection title="Invoices" description="Download past invoices.">
          {invoices.length === 0 ? (
            <p className="text-[14px] text-[var(--text-muted)]">No invoices yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-2.5 text-[14px]">
                  <span className="text-[var(--text)]">
                    {inv.number} · {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-[var(--text-muted)]">{formatCurrency(inv.amountDue, inv.currency.toUpperCase())}</span>
                    <Badge tone={inv.status === "paid" ? "success" : "warning"}>{inv.status}</Badge>
                    {/* Opens the receipt in a new tab, where the browser's own
                        print dialog saves it as a PDF. */}
                    <a
                      href={`/api/billing/invoice/${inv.id}`}
                      target="_blank"
                      rel="noopener"
                      className="text-[13px] text-[var(--primary)] hover:underline"
                    >
                      Receipt
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SettingsSection>
      ) : (
        <SettingsSection title="Invoices" description="Download past invoices.">
          <p className="text-[14px] text-[var(--text-muted)]">
            Invoices are visible to billing managers. Ask an admin for a copy.
          </p>
        </SettingsSection>
      )}
    </>
  );
}
