import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getUsage } from "@/lib/adapters/billing";
import { PLAN_CATALOG, type PlanKey } from "@/lib/constants";
import { formatCurrency, formatDate, parseJson } from "@/lib/utils";
import { Progress } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "../_form";
import { PlanPicker, CancelButton } from "./billing-client";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { changed } = await searchParams;
  const orgId = ctx.active.org.id;
  const canManage = can(ctx.active.role, "billing.manage");

  const [sub, invoices, usage, plans] = await Promise.all([
    db.subscription.findUnique({ where: { orgId }, include: { plan: true } }),
    db.invoice.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 10 }),
    getUsage(orgId),
    db.plan.findMany({ orderBy: { sortIndex: "asc" } }),
  ]);

  const currentPlan = plans.find((p) => p.id === sub?.planId);
  const catalog = PLAN_CATALOG.find((p) => p.key === (currentPlan?.key as PlanKey));

  const meters = catalog
    ? [
        { label: "Social accounts", used: usage.channels, limit: catalog.maxChannels },
        { label: "Team members", used: usage.users, limit: catalog.maxUsers },
        { label: "Scheduled posts (mo)", used: usage.scheduled_posts, limit: catalog.maxScheduled },
        { label: "AI credits (mo)", used: usage.ai_credits, limit: catalog.aiCredits },
        { label: "Storage (MB)", used: usage.storage_mb, limit: catalog.storageMb },
        { label: "API calls (mo)", used: usage.api_calls, limit: catalog.aiCredits * 50 },
      ]
    : [];

  return (
    <>
      {changed && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 text-[14px] text-[var(--success)]">
          Plan updated.
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
          {canManage && sub?.status !== "canceled" && <CancelButton />}
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
                  <span className="tabular-nums text-[var(--text-muted)]">{formatCurrency(inv.amountDue)}</span>
                  <Badge tone={inv.status === "paid" ? "success" : "warning"}>{inv.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </>
  );
}
