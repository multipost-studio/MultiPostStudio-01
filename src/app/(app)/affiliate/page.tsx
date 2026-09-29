import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { getMyAffiliateAction } from "@/app/actions/affiliates";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { formatCurrency } from "@/lib/utils";
import { ApplyButton, AffiliateShare } from "./affiliate-client";

export const metadata: Metadata = { title: "Affiliate program" };

export default async function AffiliatePage() {
  await requireUser();
  const settings = await getSettings();

  if (!settings.affiliateEnabled) {
    return (
      <>
        <PageHeader title="Affiliate program" description="Earn real commissions for referrals." />
        <EmptyState
          title="Affiliate program currently inactive"
          description="The affiliate program is currently disabled by system administrators. Check back soon."
        />
      </>
    );
  }

  const res = await getMyAffiliateAction();
  const affiliate = res.data;

  if (!affiliate) {
    return (
      <>
        <PageHeader title="Affiliate program" description="Earn real commissions for every customer you bring in." />
        <Card>
          <CardContent className="space-y-4 pt-5">
            <p className="text-[14px] text-[var(--text-muted)]">
              Apply to join the affiliate program and get a unique link to share.{" "}
              {settings.affiliateApplicationRequired
                ? "Applications are reviewed by our team before your link goes live."
                : "Approval is automatic — your link will be ready right away."}
            </p>
            <ApplyButton />
          </CardContent>
        </Card>
      </>
    );
  }

  if (affiliate.applicationStatus === "pending_review") {
    return (
      <>
        <PageHeader title="Affiliate program" description="Your application is under review." />
        <EmptyState
          title="Application submitted"
          description="We're reviewing your affiliate application. You'll be notified once it's approved."
        />
      </>
    );
  }

  if (affiliate.applicationStatus === "rejected") {
    return (
      <>
        <PageHeader title="Affiliate program" description="Application status" />
        <EmptyState title="Application not approved" description="Your affiliate application wasn't approved at this time." />
      </>
    );
  }

  const isPercent = affiliate.commissionType.startsWith("percent");
  const commissionLabel = isPercent
    ? `${affiliate.commissionRate}%`
    : formatCurrency(affiliate.commissionFixedAmount, affiliate.currency);

  return (
    <>
      <PageHeader title="Affiliate program" description="Share your link and earn real commissions." />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-muted)]">Your affiliate link</p>
              <AffiliateShare link={affiliate.link} code={affiliate.affiliateCode} />
            </div>
            <ul className="space-y-1.5 text-[14px] text-[var(--text-muted)]">
              <li>• Share your link — attribution is locked in the moment someone signs up through it.</li>
              <li>
                • You earn <strong>{commissionLabel}</strong>{" "}
                {affiliate.commissionType.includes("recurring")
                  ? "of their subscription, recurring while they stay subscribed"
                  : "as a one-time commission"}
                .
              </li>
              <li>
                • Commissions are reviewed, then paid out once your balance passes{" "}
                <strong>{formatCurrency(affiliate.payoutThresholdMinor, affiliate.currency)}</strong>.
              </li>
            </ul>
            {affiliate.status !== "active" && (
              <Badge tone="warning">Account {affiliate.status} — new commissions are paused</Badge>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-1">
          <Stat label="Clicks" value={affiliate.clicks} />
          <Stat label="Conversions" value={affiliate.conversions} />
          <Stat label="Pending" money={affiliate.pendingMinor} currency={affiliate.currency} />
          <Stat label="Paid out" money={affiliate.paidMinor} currency={affiliate.currency} />
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, money, currency }: { label: string; value?: number; money?: number; currency?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1 text-[24px] font-extrabold text-[var(--text)]">
        {value !== undefined ? value.toLocaleString() : formatCurrency(money ?? 0, currency)}
      </p>
    </div>
  );
}
