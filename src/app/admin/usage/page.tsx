import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { formatNumber, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · Usage & API" };

export default async function AdminUsagePage() {
  const month = new Date().toISOString().slice(0, 7);
  const [usage, keys, deliveries, jobs] = await Promise.all([
    db.usageRecord.findMany({ where: { periodMonth: month }, include: { org: true } }),
    db.apiKey.findMany({ where: { revokedAt: null }, include: { org: true } }),
    db.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { webhook: { include: { org: true } } } }),
    db.publishJob.groupBy({ by: ["status"], _count: true }),
  ]);

  const byMetric = usage.reduce<Record<string, number>>((acc, u) => {
    acc[u.metric] = (acc[u.metric] ?? 0) + u.value;
    return acc;
  }, {});
  const jobByStatus = Object.fromEntries(jobs.map((j) => [j.status, j._count]));

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

      <div>
        <h2 className="mb-2 text-[14px] font-semibold text-[var(--text)]">Publish queue health</h2>
        <div className="flex flex-wrap gap-2">
          {["queued", "running", "done", "failed", "canceled"].map((s) => (
            <Badge key={s} tone={s === "failed" ? "danger" : s === "done" ? "success" : "neutral"}>
              {s}: {jobByStatus[s] ?? 0}
            </Badge>
          ))}
        </div>
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
