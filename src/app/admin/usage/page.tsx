import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Donut, Bars, CHART_COLORS } from "@/components/charts";
import { formatNumber, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · Usage & API" };

export default async function AdminUsagePage() {
  const month = new Date().toISOString().slice(0, 7);
  const [usage, keys, deliveries, jobs, allDeliveries] = await Promise.all([
    db.usageRecord.findMany({ where: { periodMonth: month }, include: { org: true } }),
    db.apiKey.findMany({ where: { revokedAt: null }, include: { org: true } }),
    db.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { webhook: { include: { org: true } } } }),
    db.publishJob.groupBy({ by: ["status"], _count: true }),
    db.webhookDelivery.findMany({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, select: { success: true } }),
  ]);

  const byMetric = usage.reduce<Record<string, number>>((acc, u) => {
    acc[u.metric] = (acc[u.metric] ?? 0) + u.value;
    return acc;
  }, {});
  const jobByStatus = Object.fromEntries(jobs.map((j) => [j.status, j._count]));

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

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="AI credits (mo)" value={formatNumber(byMetric.ai_credits ?? 0)} />
        <Stat label="Scheduled posts" value={formatNumber(byMetric.scheduled_posts ?? 0)} />
        <Stat label="Storage MB" value={formatNumber(byMetric.storage_mb ?? 0)} />
        <Stat label="API calls" value={formatNumber(byMetric.api_calls ?? 0)} />
        <Stat label="Active API keys" value={keys.length} />
        <Stat label="Publish jobs done" value={formatNumber(jobByStatus.done ?? 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Usage this month</CardTitle></CardHeader>
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
