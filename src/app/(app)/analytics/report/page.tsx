import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { getAnalytics, type Range } from "@/lib/analytics";
import { formatNumber, formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Analytics report" };
const RANGES: Range[] = [7, 14, 30, 90];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Row({ label, prev, cur }: { label: string; prev: number; cur: number }) {
  const pct = prev ? ((cur - prev) / Math.abs(prev)) * 100 : cur ? 100 : 0;
  return (
    <tr className="border-b border-[var(--border)]">
      <td className="py-1.5 text-[var(--text-muted)]">{label}</td>
      <td className="py-1.5 text-right tabular-nums text-[var(--text-subtle)]">{formatNumber(prev)}</td>
      <td className="py-1.5 text-right font-medium tabular-nums">{formatNumber(cur)}</td>
      <td className={`py-1.5 text-right tabular-nums ${pct >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
      </td>
    </tr>
  );
}

export default async function AnalyticsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { range } = await searchParams;
  const days = (RANGES.includes(Number(range) as Range) ? Number(range) : 30) as Range;
  const a = await getAnalytics(ctx.active.workspace.id, days);
  const best = a.bestSlots[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Performance report</h1>
          <p className="text-[13px] text-[var(--text-muted)]">
            {ctx.active.workspace.name} · last {days} days · generated {formatDate(new Date())}
          </p>
        </div>
        <PrintButton />
      </div>

      <section>
        <h2 className="mb-2 text-[14px] font-semibold text-[var(--text)]">Headline</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Reach", formatNumber(a.totals.reach)],
            ["Impressions", formatNumber(a.totals.impressions)],
            ["Engagement", formatNumber(a.totals.engagement)],
            ["Eng. rate", `${a.engagementRate.toFixed(1)}%`],
            ["Followers", formatNumber(a.totals.followers)],
            ["Net new followers", formatNumber(a.totals.followerGrowth)],
            ["Posts published", String(a.postCount)],
            ["Best time", best ? `${DOW[best.day]} ${best.hour}:00` : "—"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">{l}</p>
              <p className="mt-0.5 text-[17px] font-semibold text-[var(--text)]">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[14px] font-semibold text-[var(--text)]">This period vs previous {days} days</h2>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--text-subtle)]">
              <th className="py-1.5 font-medium">Metric</th>
              <th className="py-1.5 text-right font-medium">Previous</th>
              <th className="py-1.5 text-right font-medium">Current</th>
              <th className="py-1.5 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Reach" prev={a.prevTotals.reach} cur={a.totals.reach} />
            <Row label="Impressions" prev={a.prevTotals.impressions} cur={a.totals.impressions} />
            <Row label="Engagement" prev={a.prevTotals.engagement} cur={a.totals.engagement} />
            <Row label="Clicks" prev={a.prevTotals.clicks} cur={a.totals.clicks} />
            <Row label="Saves" prev={a.prevTotals.saves} cur={a.totals.saves} />
            <Row label="Follower growth" prev={a.prevTotals.followerGrowth} cur={a.totals.followerGrowth} />
          </tbody>
        </table>
      </section>

      {a.byFormat.some((f) => f.posts > 0) && (
        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-[var(--text)]">By format</h2>
          <table className="w-full text-[13px]">
            <tbody>
              {a.byFormat.filter((f) => f.posts > 0).map((f) => (
                <tr key={f.format} className="border-b border-[var(--border)]">
                  <td className="py-1.5 text-[var(--text-muted)]">{f.format}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--text-subtle)]">{f.posts} posts</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{f.avgEngagementRate.toFixed(1)}% ER</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {a.topPosts.length > 0 && (
        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-[var(--text)]">Top posts</h2>
          <ol className="space-y-1.5 text-[13px]">
            {a.topPosts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-1.5">
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="text-[var(--text-subtle)]">{p.platform}</span>
                <span className="font-semibold tabular-nums text-[var(--success)]">{p.engagementRate.toFixed(1)}%</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {a.byHashtag.length > 0 && (
        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-[var(--text)]">Top hashtags</h2>
          <p className="text-[13px] text-[var(--text-muted)]">
            {a.byHashtag.slice(0, 10).map((h) => `#${h.name} (${h.avgEngagementRate.toFixed(1)}%)`).join("  ·  ")}
          </p>
        </section>
      )}
    </div>
  );
}
