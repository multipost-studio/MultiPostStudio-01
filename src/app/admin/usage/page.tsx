import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Stat } from "@/components/ui/misc";
import { parseAdminQuery } from "@/lib/admin-query";
import { usageQueryOpts, usageWhere } from "@/lib/admin-exports/commerce";
import { AdminToolbar } from "../_controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Donut, Bars } from "@/components/charts";
import { CHART_COLORS } from "@/lib/chart-colors";
import { formatNumber, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · Usage & API" };

const METRICS = ["ai_credits", "scheduled_posts", "storage_mb", "api_calls", "channels", "users"];

/** The current month and the 11 before it, newest first. */
function recentMonths(): string[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("usage.view");
  const raw = await searchParams;
  const query = parseAdminQuery(raw, usageQueryOpts);
  const where = usageWhere(query);
  const month = where.periodMonth as string;
  const months = recentMonths();
  if (!months.includes(month)) months.push(month);
  const [usage, keyCount, deliveries, jobs, allDeliveries] = await Promise.all([
    // Egress: platform-wide scans capped to rendered columns. `usage` feeds
    // per-metric sums (org name only); keys feed a single count stat.
    db.usageRecord.findMany({
      where,
      take: 5000,
      select: { metric: true, value: true, org: { select: { name: true } } },
    }),
    db.apiKey.count({ where: { revokedAt: null } }),
    db.webhookDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        event: true,
        statusCode: true,
        success: true,
        createdAt: true,
        webhook: { select: { org: { select: { name: true } } } },
      },
    }),
    db.publishJob.groupBy({ by: ["status"], _count: true }),
    db.webhookDelivery.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      take: 5000,
      select: { success: true },
    }),
  ]);

  const byMetric = usage.reduce<Record<string, number>>((acc, u) => {
    acc[u.metric] = (acc[u.metric] ?? 0) + u.value;
    return acc;
  }, {});
  const jobByStatus = Object.fromEntries(jobs.map((j) => [j.status, j._count]));
  const orgTotals = new Map<string, Record<string, number>>();
  for (const u of usage) {
    const cur = orgTotals.get(u.org.name) ?? {};
    cur[u.metric] = (cur[u.metric] ?? 0) + u.value;
    orgTotals.set(u.org.name, cur);
  }
  const topOrgs = [...orgTotals.entries()]
    .map(([name, byMetric]) => ({ name, byMetric, total: Object.values(byMetric).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  const jobDonut = jobs.map((j, i) => ({
    name: j.status,
    value: j._count,
    color: j.status === "failed" ? CHART_COLORS[0] : j.status === "done" ? CHART_COLORS[4] : CHART_COLORS[i % CHART_COLORS.length],
  }));
  const whOk = allDeliveries.filter((d) => d.success).length;
  const whFail = allDeliveries.length - whOk;
  const metricBars = [
    { label: "AI credits", value: byMetric.ai_credits ?? 0 },
    { label: "Scheduled", value: byMetric.scheduled_posts ?? 0 },
    { label: "Storage MB", value: byMetric.storage_mb ?? 0 },
    { label: "API calls", value: byMetric.api_calls ?? 0 },
    { label: "Channels", value: byMetric.channels ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--text)]">Usage & API monitoring</h1>

      <AdminToolbar
        searchPlaceholder="Search organization…"
        exportType="usage"
        pagination={false}
        filters={[
          { key: "month", label: "Month", options: months.map((m) => ({ value: m, label: m })) },
          { key: "metric", label: "Metric", options: METRICS.map((m) => ({ value: m, label: m.replace(/_/g, " ") })) },
        ]}
      />
      <p className="-mt-3 text-[13px] text-[var(--text-muted)]">
        Showing <strong>{month}</strong>
        {query.filters.metric ? <> · {query.filters.metric.replace(/_/g, " ")}</> : null}
        {query.q ? <> · matching “{query.q}”</> : null}. Export uses the same filters.
      </p>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="AI credits (mo)" value={formatNumber(byMetric.ai_credits ?? 0)} />
        <Stat label="Scheduled posts" value={formatNumber(byMetric.scheduled_posts ?? 0)} />
        <Stat label="Storage MB" value={formatNumber(byMetric.storage_mb ?? 0)} />
        <Stat label="API calls" value={formatNumber(byMetric.api_calls ?? 0)} />
        <Stat label="Active API keys" value={keyCount} />
        <Stat label="Publish jobs done" value={formatNumber(jobByStatus.done ?? 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Usage · {month}</CardTitle></CardHeader>
          <CardContent><Bars data={metricBars} dataKey="value" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Publish queue</CardTitle></CardHeader>
          <CardContent>
            {jobDonut.length ? <Donut data={jobDonut} /> : <p className="text-[14px] text-[var(--text-muted)]">No jobs.</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["queued", "running", "done", "failed", "canceled"].map((st) => (
                <Badge key={st} tone={st === "failed" ? "danger" : st === "done" ? "success" : "neutral"}>
                  {st}: {jobByStatus[st] ?? 0}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Webhook deliveries · 7 days</CardTitle></CardHeader>
          <CardContent>
            {allDeliveries.length ? (
              <Donut
                data={[
                  { name: "ok", value: whOk, color: CHART_COLORS[4] },
                  { name: "failed", value: whFail, color: CHART_COLORS[0] },
                ]}
              />
            ) : (
              <p className="text-[14px] text-[var(--text-muted)]">No deliveries.</p>
            )}
            <p className="mt-2 text-[13px] text-[var(--text-muted)]">
              {allDeliveries.length ? `${Math.round((whOk / allDeliveries.length) * 100)}% success` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-[14px] font-semibold text-[var(--text)]">Top organizations · {month}</h2>
        <Table>
          <THead>
            <TR>
              <TH>Organization</TH>
              {METRICS.map((m) => (
                <TH key={m} className="text-right">{m.replace(/_/g, " ")}</TH>
              ))}
            </TR>
          </THead>
          <tbody>
            {topOrgs.length === 0 ? (
              <TR>
                <TD colSpan={METRICS.length + 1} className="py-6 text-center text-[var(--text-muted)]">No usage recorded for these filters.</TD>
              </TR>
            ) : (
              topOrgs.map((o) => (
                <TR key={o.name}>
                  <TD className="font-medium text-[var(--text)]">{o.name}</TD>
                  {METRICS.map((m) => (
                    <TD key={m} className="text-right tabular-nums">{o.byMetric[m] ? formatNumber(o.byMetric[m]) : "—"}</TD>
                  ))}
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-[14px] font-semibold text-[var(--text)]">Recent webhook deliveries</h2>
        <Table>
          <THead>
            <TR>
              <TH>Org</TH>
              <TH>Event</TH>
              <TH>Status</TH>
              <TH>When</TH>
            </TR>
          </THead>
          <tbody>
            {deliveries.map((d) => (
              <TR key={d.id}>
                <TD>{d.webhook.org.name}</TD>
                <TD className="font-mono text-[13px]">{d.event}</TD>
                <TD>
                  <span className={d.success ? "text-[var(--success)]" : "text-[var(--danger)]"}>{d.statusCode ?? "—"}</span>
                </TD>
                <TD className="text-[var(--text-subtle)]">{relativeTime(d.createdAt)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
