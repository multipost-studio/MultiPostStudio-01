import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, Info, Target, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { getAcquisitionReport } from "@/lib/marketing-analytics";
import { parseCustomRange, todayDay } from "@/lib/date-range";
import { UNTRACKED } from "@/lib/attribution";
import type { GroupBy, Insight, ReportRow, Touch } from "@/lib/marketing-report";
import { MetricCard } from "../_metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { MultiLine } from "@/components/charts";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { MarketingSubNav } from "./_sub-nav";
import { AcquisitionControls } from "./_controls";

export const metadata: Metadata = { title: "Admin · Marketing" };
export const dynamic = "force-dynamic";

const GROUPS: GroupBy[] = ["channel", "source", "medium", "campaign", "landing", "referrer"];
const GROUP_LABEL: Record<GroupBy, string> = { channel: "Channel", source: "Source", medium: "Medium", campaign: "Campaign", landing: "Landing page", referrer: "Referrer" };
// Which audience filter each grouping can seed. Landing page and referrer are not audience dimensions.
const AUDIENCE_PARAM: Partial<Record<GroupBy, string>> = { channel: "channels", source: "sources", medium: "mediums", campaign: "campaigns" };

type SP = { days?: string; by?: string; touch?: string; from?: string; to?: string };

const pctChange = (now: number, prev: number | undefined) => (prev && prev > 0 ? ((now - prev) / prev) * 100 : null);
const pct = (n: number | null, d = 1) => (n === null ? "—" : `${(n * 100).toFixed(d)}%`);

function mrrLabel(m: { usd: number; inr: number }): string {
  const parts = [m.usd > 0 && formatCurrency(m.usd, "USD"), m.inr > 0 && formatCurrency(m.inr, "INR")].filter(Boolean);
  return parts.length ? parts.join(" + ") : "—";
}

const TONE_ICON = { good: CheckCircle2, warn: AlertTriangle, info: Info } as const;
const TONE_CLASS = { good: "text-[var(--success)]", warn: "text-[var(--warning)]", info: "text-[var(--info)]" } as const;

export default async function AdminMarketingPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPermission("marketing.view");
  const sp = await searchParams;
  const now = new Date();
  const wantsCustom = sp.days === "custom";
  const custom = wantsCustom ? parseCustomRange(sp.from, sp.to, { now, maxDays: 365 }) : null;
  const days = custom ? custom.days : [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const rangeError = wantsCustom && !custom ? "That date range isn't valid (it must start in the past and span at most a year), so the last 30 days are shown instead." : null;
  const by = (GROUPS as string[]).includes(sp.by ?? "") ? (sp.by as GroupBy) : "channel";
  const touch: Touch = sp.touch === "last" ? "last" : "first";

  let data: Awaited<ReturnType<typeof getAcquisitionReport>> | null = null;
  try {
    data = await getAcquisitionReport({ days, groupBy: by, touch, range: custom });
  } catch {
    data = null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Marketing</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Where visitors and signups come from, what they turn into, and who to talk to next. Built from first-party tracking, not a sample.
        </p>
      </div>

      <MarketingSubNav />

      {!data ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-[14px] text-[var(--danger)]">
          Couldn&apos;t load acquisition data. If this is a new deploy, check that the latest database migration has been applied.
        </p>
      ) : (
        <>
          {rangeError && <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px] text-[var(--text)]">{rangeError}</p>}
          <AcquisitionControls days={days} custom={custom ? { from: custom.fromDay, to: custom.toDay } : null} today={todayDay(now)} by={by} touch={touch} />
          <Report data={data} by={by} touch={touch} />
        </>
      )}
    </div>
  );
}

function Report({ data, by, touch }: { data: NonNullable<Awaited<ReturnType<typeof getAcquisitionReport>>>; by: GroupBy; touch: Touch }) {
  const { report: r, insights, days, custom, truncated, trackingHasData } = data;
  const t = r.totals;
  const paying = t.paid;

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 text-[12.5px] text-[var(--text-subtle)]">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Visitors in the EU, UK, Switzerland and India are counted only after they accept analytics cookies, so those regions read lower than real traffic. Declined or Do-Not-Track visitors are never counted.
        </span>
      </p>

      {!trackingHasData && (
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[14px]">
          <Info size={18} className="mt-0.5 shrink-0 text-[var(--info)]" aria-hidden />
          <div>
            <p className="font-medium text-[var(--text)]">Tracking is on, but no visits have been recorded yet.</p>
            <p className="mt-0.5 text-[var(--text-muted)]">
              Visits appear as people land on your marketing and sign-up pages. Share a link built with the{" "}
              <Link href="/admin/marketing/links" className="font-medium text-[var(--primary)] hover:underline">
                UTM builder
              </Link>{" "}
              to see a campaign here.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Visitors" value={formatNumber(t.visitors)} delta={pctChange(t.visitors, r.previous?.visitors)} icon={<Eye size={17} />} tone="info" />
        <MetricCard label="Signups" value={formatNumber(t.signups)} delta={pctChange(t.signups, r.previous?.signups)} icon={<UserPlus size={17} />} />
        <MetricCard label="Visitor to signup" value={pct(t.signupRate)} icon={<TrendingUp size={17} />} tone="warning" deltaHint="" />
        <MetricCard
          label="Paying customers"
          value={formatNumber(paying)}
          icon={<Wallet size={17} />}
          tone="success"
          deltaHint=""
        />
      </div>
      <p className="-mt-3 text-[13px] text-[var(--text-subtle)]">
        {paying > 0 ? `Monthly revenue from these signups: ${mrrLabel(t.mrr)}. ` : ""}
        {custom ? `${custom.from} to ${custom.to} (${days} day${days === 1 ? "" : "s"})` : `Last ${days} days`}{r.previous ? ", compared with the " + days + " days before" : ""}. {t.activated} of {t.signups} signups connected a channel or created a post.
      </p>

      {truncated && (
        <p role="status" className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-[13px] text-[var(--warning)]">
          This range has more data than one report can load, so the numbers are a lower bound. Pick a shorter range.
        </p>
      )}

      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>What stands out</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[var(--border)]">
              {insights.map((i) => (
                <InsightRow key={i.id} insight={i} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Visitors and signups</CardTitle>
        </CardHeader>
        <CardContent>
          <MultiLine
            data={r.series}
            lines={[
              { key: "visitors", label: "Visitors", color: "var(--info)" },
              { key: "signups", label: "Signups", color: "var(--primary)" },
            ]}
            height={240}
          />
        </CardContent>
      </Card>

      <section className="space-y-2" aria-labelledby="by-group">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="by-group" className="text-[15px] font-semibold text-[var(--text)]">
            By {GROUP_LABEL[by].toLowerCase()}
          </h2>
          <p className="text-[12.5px] text-[var(--text-subtle)]">
            Signups credited to their {touch === "first" ? "first" : "last"} touch · visitors are unique people
          </p>
        </div>
        <GroupTable rows={r.rows} by={by} />
        {t.untrackedSignups > 0 && (
          <p className="text-[12.5px] text-[var(--text-subtle)]">
            {UNTRACKED}: {t.untrackedSignups} signup{t.untrackedSignups === 1 ? "" : "s"} have no tracking data, typically accounts created before tracking started, or people who declined cookies, block tracking, or send Do Not Track.
          </p>
        )}
      </section>
    </div>
  );
}

function InsightRow({ insight: i }: { insight: Insight }) {
  const Icon = TONE_ICON[i.tone];
  const param = i.about ? AUDIENCE_PARAM[i.about.groupBy] : undefined;
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Icon size={17} className={cn("mt-0.5 shrink-0", TONE_CLASS[i.tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-[var(--text)]">{i.title}</p>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{i.detail}</p>
      </div>
      {i.about && param && (
        <Link
          href={`/admin/marketing/audiences?${param}=${encodeURIComponent(i.about.key)}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[13px] font-medium text-[var(--primary)] hover:bg-[var(--primary-soft)]"
        >
          <Target size={13} aria-hidden /> Target
        </Link>
      )}
    </li>
  );
}

function GroupTable({ rows, by }: { rows: ReportRow[]; by: GroupBy }) {
  if (rows.length === 0) {
    return <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-8 text-center text-[14px] text-[var(--text-muted)]">No visits or signups in this range yet.</p>;
  }
  const param = AUDIENCE_PARAM[by];
  const max = Math.max(...rows.map((x) => x.signups), 1);
  return (
    <Table label={`Acquisition by ${by}`}>
      <THead>
        <TR>
          <TH>{GROUP_LABEL[by]}</TH>
          <TH className="text-right">Visitors</TH>
          <TH className="text-right">Signups</TH>
          <TH className="text-right">Rate</TH>
          <TH className="text-right">Activated</TH>
          <TH className="text-right">Paying</TH>
          <TH className="text-right">MRR</TH>
          {param && <TH className="text-right">Audience</TH>}
        </TR>
      </THead>
      <tbody>
        {rows.map((x) => {
          const muted = x.key === UNTRACKED || x.key === "(none)";
          return (
            <TR key={x.key}>
              <TD className="max-w-[260px]">
                <p className={cn("truncate font-medium", muted ? "text-[var(--text-muted)] italic" : "text-[var(--text)]")}>{x.key}</p>
                <div className="mt-1 h-1 w-full max-w-[160px] overflow-hidden rounded-full bg-[var(--bg-sunken)]" aria-hidden>
                  <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(x.signups / max) * 100}%` }} />
                </div>
              </TD>
              <TD className="text-right tabular-nums">{x.visitors ? formatNumber(x.visitors) : "—"}</TD>
              <TD className="text-right font-medium tabular-nums">{formatNumber(x.signups)}</TD>
              <TD className="text-right tabular-nums text-[var(--text-muted)]">{pct(x.signupRate)}</TD>
              <TD className="text-right tabular-nums text-[var(--text-muted)]">{x.signups ? pct(x.activated / x.signups, 0) : "—"}</TD>
              <TD className="text-right tabular-nums">{x.paid || "—"}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums text-[var(--text-muted)]">{mrrLabel(x.mrr)}</TD>
              {param && (
                <TD className="text-right">
                  {!muted && x.signups > 0 ? (
                    <Link
                      href={`/admin/marketing/audiences?${param}=${encodeURIComponent(x.key)}`}
                      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[13px] font-medium text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                      aria-label={`Target the ${x.key} audience`}
                    >
                      <Target size={13} aria-hidden /> Target
                    </Link>
                  ) : (
                    <span className="text-[var(--text-subtle)]">—</span>
                  )}
                </TD>
              )}
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}
