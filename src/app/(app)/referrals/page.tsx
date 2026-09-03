import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { ensureReferralCode, referralLink, referralStats } from "@/lib/referrals";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { ReferralShare } from "./referrals-client";

export const metadata: Metadata = { title: "Refer a friend" };

export default async function ReferralsPage() {
  const user = await requireUser();
  const settings = await getSettings();

  if (!settings.referralEnabled) {
    return (
      <>
        <PageHeader title="Refer a friend" description="Invite friends and earn." />
        <EmptyState title="Referrals are turned off" description="The program isn't active right now." />
      </>
    );
  }

  const code = await ensureReferralCode(user.id);
  const link = referralLink(code);
  const stats = await referralStats(user.id);

  return (
    <>
      <PageHeader title={settings.referralHeadline} description={settings.referralSubtext} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-muted)]">Your referral link</p>
              <ReferralShare link={link} code={code} />
            </div>
            <ul className="space-y-1.5 text-[14px] text-[var(--text-muted)]">
              <li>• Share your link with a friend.</li>
              <li>
                • They sign up and{" "}
                {settings.referralTrigger === "signup"
                  ? "the reward is instant"
                  : settings.referralTrigger === "paid_plan"
                    ? "upgrade to a paid plan"
                    : "verify their email"}
                .
              </li>
              <li>
                • You get <strong>{settings.referralRewardReferrer}</strong> bonus AI credits, they get{" "}
                <strong>{settings.referralRewardReferee}</strong> — added to each monthly allowance.
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          <Stat label="Invited" value={stats.total} />
          <Stat label="Converted" value={stats.converted} />
          <Stat label="Credits earned" value={stats.creditsEarned} />
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-[15px] font-bold text-[var(--text)]">Your referrals</h2>
        {stats.recent.length === 0 ? (
          <EmptyState title="No referrals yet" description="Share your link to get started." />
        ) : (
          <Card>
            <CardContent className="divide-y divide-[var(--border)] p-0">
              {stats.recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[14px] font-medium text-[var(--text)]">{r.who}</p>
                    {r.email && <p className="text-[12px] text-[var(--text-subtle)]">{r.email}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] text-[var(--text-subtle)]">{relativeTime(r.at)}</span>
                    <Badge tone={r.status === "converted" ? "success" : "neutral"}>
                      {r.rewarded ? "rewarded" : r.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1 text-[24px] font-extrabold text-[var(--text)]">{value.toLocaleString()}</p>
    </div>
  );
}
