import type { Metadata } from "next";
import { adminAnalytics } from "@/lib/admin-analytics";
import { Stat } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendArea, Bars, Donut } from "@/components/charts";
import { CHART_COLORS } from "@/components/charts";
import { relativeTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminOverviewPage() {
  const a = await adminAnalytics();
  const s = a.stats;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--text)]">Overview</h1>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={formatNumber(s.users)} />
        <Stat label="Organizations" value={formatNumber(s.orgs)} />
        <Stat label="Workspaces" value={formatNumber(s.workspaces)} />
        <Stat label="Posts" value={formatNumber(s.postsTotal)} />
        <Stat label="Active subs" value={formatNumber(s.activeSubs)} />
        <Stat label="Est. MRR" value={`$${(s.mrr / 100).toFixed(0)}`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Open tickets" value={s.openTickets} />
        <Stat label="Referrals" value={s.referralsTotal} />
        <Stat label="Referrals converted" value={s.referralsConverted} />
        <Stat label="Bonus credits issued" value={formatNumber(s.bonusCreditsIssued)} />
        <Stat label="AI credits (mo)" value={formatNumber(s.aiCreditsMonth)} />
        <Stat label="Scheduled (mo)" value={formatNumber(s.scheduledMonth)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>New sign-ups · 30 days</CardTitle></CardHeader>
          <CardContent><Bars data={a.signupSeries} dataKey="value" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total users · 30 days</CardTitle></CardHeader>
          <CardContent><TrendArea data={a.growthSeries} dataKey="value" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Posts published · 14 days</CardTitle></CardHeader>
          <CardContent><Bars data={a.publishSeries} dataKey="value" color={CHART_COLORS[4]} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Paid invoice revenue · 6 months ($)</CardTitle></CardHeader>
          <CardContent><Bars data={a.revenueSeries} dataKey="value" color={CHART_COLORS[5]} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Subscriptions by plan</CardTitle></CardHeader>
          <CardContent>
            {a.planDonut.length ? (
              <Donut data={a.planDonut.map((d, i) => ({ ...d, color: CHART_COLORS[i % CHART_COLORS.length] }))} />
            ) : (
              <p className="text-[14px] text-[var(--text-muted)]">No subscriptions yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>This month&apos;s usage</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              ["AI credits", a.usageByMetric.ai_credits ?? 0],
              ["Scheduled posts", a.usageByMetric.scheduled_posts ?? 0],
              ["Storage (MB)", a.usageByMetric.storage_mb ?? 0],
              ["API calls", a.usageByMetric.api_calls ?? 0],
              ["Channels", a.usageByMetric.channels ?? 0],
            ].map(([label, v]) => (
              <div key={label} className="flex items-center justify-between text-[14px]">
                <span className="text-[var(--text-muted)]">{label}</span>
                <span className="font-semibold tabular-nums text-[var(--text)]">{formatNumber(Number(v))}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Newest users</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-[13px]">
              {a.recentSignups.map((u) => (
                <li key={u.email} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[var(--text)]">{u.name}</span>
                    <span className="block truncate text-[var(--text-subtle)]">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-[var(--text-subtle)]">{relativeTime(u.at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent admin actions</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-[13px]">
              {a.recentAudit.map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[12px] text-[var(--text-muted)]">{x.action}</span>
                  <span className="shrink-0 text-[var(--text-subtle)]">{relativeTime(x.at)}</span>
                </li>
              ))}
              {a.recentAudit.length === 0 && <li className="text-[var(--text-subtle)]">Nothing yet.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>System events</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-[13px]">
              {a.recentEvents.map((e) => (
                <li key={e.id} className="flex items-start gap-2">
                  <Badge tone={e.level === "error" ? "danger" : e.level === "warn" ? "warning" : "neutral"}>{e.level}</Badge>
                  <span className="flex-1 text-[var(--text-muted)]">
                    <span className="text-[var(--text-subtle)]">[{e.source}]</span> {e.message}
                    <span className="block text-[11px] text-[var(--text-subtle)]">{relativeTime(e.at)}</span>
                  </span>
                </li>
              ))}
              {a.recentEvents.length === 0 && <li className="text-[var(--text-subtle)]">No events.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
