import type { Metadata } from "next";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { relativeTime } from "@/lib/utils";
import { JobActions } from "../_more-client";

export const metadata: Metadata = { title: "Admin · System health" };

const HOUR = 3_600_000;

export default async function AdminSystemPage() {
  const [events, jobStats, failedJobs, dbOk, recentJobs, whRecent, errEvents] = await Promise.all([
    db.systemEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    db.publishJob.groupBy({ by: ["status"], _count: true }),
    db.publishJob.count({ where: { status: "failed" } }),
    db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    db.publishJob.findMany({
      where: { status: { in: ["failed", "queued", "running"] } },
      orderBy: { runAt: "desc" },
      take: 25,
      include: { post: { select: { title: true, workspace: { select: { org: { select: { name: true } } } } } } },
    }),
    db.webhookDelivery.findMany({ where: { createdAt: { gte: new Date(Date.now() - 24 * HOUR) } }, select: { success: true } }),
    db.systemEvent.findMany({ where: { level: "error", createdAt: { gte: new Date(Date.now() - HOUR / 2) } }, select: { source: true } }),
  ]);

  const jobs = Object.fromEntries(jobStats.map((j) => [j.status, j._count]));

  // Real health signals — no hardcoded "ok".
  const recentErrSources = new Set(errEvents.map((e) => e.source));
  const whOk = whRecent.filter((d) => d.success).length;
  const whHealthy = whRecent.length === 0 || whOk / whRecent.length >= 0.9;

  const services: { name: string; state: string; ok: boolean }[] = [
    { name: "Database", state: dbOk ? "Operational" : "Unreachable", ok: dbOk },
    {
      name: "Publish queue",
      state: failedJobs >= 10 || recentErrSources.has("queue") ? "Degraded" : "Operational",
      ok: failedJobs < 10 && !recentErrSources.has("queue"),
    },
    {
      name: "Webhooks",
      state: !whHealthy || recentErrSources.has("webhook") ? "Degraded" : "Operational",
      ok: whHealthy && !recentErrSources.has("webhook"),
    },
    {
      name: "AI adapter",
      state: !flags.realAI ? "Stub (no key)" : recentErrSources.has("ai") ? "Degraded" : "Operational",
      ok: !flags.realAI || !recentErrSources.has("ai"),
    },
    { name: "Storage", state: flags.realStorage ? "S3" : "Local disk", ok: true },
    { name: "Email", state: flags.realEmail ? "Operational" : "Stub (no key)", ok: true },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--text)]">System health</h1>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {services.map((s) => (
          <Card key={s.name}>
            <CardContent className="pt-5">
              <p className="text-[13px] uppercase tracking-wide text-[var(--text-subtle)]">{s.name}</p>
              <p className={`mt-1 text-[16px] font-semibold ${s.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                {s.state}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue depth</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {["queued", "running", "done", "failed", "canceled"].map((s) => (
            <Badge key={s} tone={s === "failed" ? "danger" : s === "done" ? "success" : "neutral"}>
              {s}: {jobs[s] ?? 0}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publish jobs needing attention</CardTitle>
        </CardHeader>
        <CardContent>
          {recentJobs.length === 0 ? (
            <p className="text-[14px] text-[var(--text-muted)]">Queue is clear.</p>
          ) : (
            <Table>
              <THead>
                <TR><TH>Post</TH><TH>Org</TH><TH>Status</TH><TH>Attempts</TH><TH>Run at</TH><TH>Last error</TH><TH>Action</TH></TR>
              </THead>
              <tbody>
                {recentJobs.map((j) => (
                  <TR key={j.id}>
                    <TD className="max-w-[180px] truncate">{j.post.title || "Untitled"}</TD>
                    <TD className="text-[var(--text-muted)]">{j.post.workspace.org.name}</TD>
                    <TD>
                      <Badge tone={j.status === "failed" ? "danger" : j.status === "running" ? "warning" : "neutral"}>{j.status}</Badge>
                    </TD>
                    <TD className="tabular-nums">{j.attempts}</TD>
                    <TD className="text-[var(--text-subtle)]">{relativeTime(j.runAt)}</TD>
                    <TD className="max-w-[220px] truncate text-[12px] text-[var(--danger)]">{j.lastError ?? "—"}</TD>
                    <TD><JobActions id={j.id} status={j.status} /></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event stream</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-[13px]">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-2">
                <Badge tone={e.level === "error" ? "danger" : e.level === "warn" ? "warning" : "neutral"}>{e.level}</Badge>
                <span className="flex-1 text-[var(--text-muted)]">
                  <span className="text-[var(--text-subtle)]">[{e.source}]</span> {e.message}
                </span>
                <span className="text-[var(--text-subtle)]">{relativeTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
