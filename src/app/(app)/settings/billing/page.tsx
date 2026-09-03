import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getUsage } from "@/lib/adapters/billing";
import { bonusAiCreditsForOrg } from "@/lib/referrals";
import { type PlanKey } from "@/lib/constants";
import { formatCurrency, formatDate, parseJson } from "@/lib/utils";
import { Progress } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "../_form";
import { PlanPicker, CancelButton, ReactivateButton, BillingDetailsForm } from "./billing-client";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { changed } = await searchParams;
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

  const currentPlan = plans.find((p) => p.id === sub?.planId);
  const bonusAi = await bonusAiCreditsForOrg(orgId);

  const trialDaysLeft =
    sub?.status === "trialing" && sub.trialEndsAt
      ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000))
      : null;

  const meters = currentPlan
    ? [
        { label: "Social accounts", used: usage.channels, limit: currentPlan.maxChannels },
        { label: "Team members", used: usage.users, limit: currentPlan.maxUsers },
        { label: "Scheduled posts (mo)", used: usage.scheduled_posts, limit: currentPlan.maxScheduled },
        {
          label: bonusAi > 0 ? `AI credits (mo) · +${bonusAi} referral bonus` : "AI credits (mo)",
          used: usage.ai_credits,
          limit: currentPlan.aiCredits + bonusAi,
        },
        { label: "Storage (MB)", used: usage.storage_mb, limit: currentPlan.storageMb },
        { label: "API calls (mo)", used: usage.api_calls, limit: currentPlan.aiCredits * 50 },
      ]
    : [];

  return (
    <>
      {changed && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 text-[14px] text-[var(--success)]">
          Plan updated.
        </p>
      )}

      {trialDaysLeft !== null && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--info)] bg-[var(--info-soft)] px-3 py-2 text-[14px] text-[var(--info)]">
          Trial: <strong>{trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"}</strong> left
          {sub?.trialEndsAt ? ` — ends ${formatDate(sub.trialEndsAt)}` : ""}. Add a plan before it ends to keep your channels active.
        </p>
      )}
      {sub?.status === "canceled" && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-[14px] text-[var(--warning)]">
          Subscription canceled
          {sub.currentPeriodEnd ? ` — access until ${formatDate(sub.currentPeriodEnd)}` : ""}, then drops to Free.
        </p>
      )}

      <SettingsSection title="Current plan" description="Your subscription and renewal.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[17px] font-semibold text-[var(--text)]">
              {currentPlan?.name ?? "Free"}{" "}
              <Badge tone={sub?.status === "active" ? "success" : sub?.status === "trialing" ? "info" : "danger"}>
                {sub?.status ?? "free"}
              </Badge>
            </p>
            <p className="text-[13px] text-[var(--text-subtle)]">
              {sub?.currentPeriodEnd ? `Renews ${formatDate(sub.currentPeriodEnd)}` : "No renewal"} ·{" "}
              {sub?.interval === "year" ? "billed annually" : "billed monthly"}
            </p>
          </div>
          {canManage && sub?.status === "canceled" && <ReactivateButton />}
          {canManage && sub && sub.status !== "canceled" && <CancelButton />}
        </div>
      </SettingsSection>

      <SettingsSection title="Usage this month" description="Limits reset on your billing date.">
        <div className="space-y-3">
          {meters.map((m) => {
            const pct = m.limit ? Math.min(100, (m.used / m.limit) * 100) : 0;
            return (
              <div key={m.label}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--text-muted)]">{m.label}</span>
                  <span className={pct > 90 ? "font-medium text-[var(--danger)]" : "text-[var(--text)]"}>
                    {m.used.toLocaleString()} / {m.limit.toLocaleString()}
                  </span>
                </div>
                <Progress value={pct} className="mt-1" />
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {canManage && (
        <SettingsSection title="Change plan" description="Upgrade or downgrade any time. Prorated automatically.">
          <PlanPicker
            currentKey={(currentPlan?.key as string) ?? "free"}
            plans={plans.map((p) => ({
              key: p.key,
              name: p.name,
              priceMonthly: p.priceMonthly,
              priceAnnual: p.priceAnnual,
              features: parseJson<string[]>(p.features, []),
            }))}
          />
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
                  <a href={`/api/billing/invoice/${inv.id}`} className="text-[13px] text-[var(--primary)] hover:underline">
                    Download
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </>
  );
}
