import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { requireAdminPermission } from "@/lib/session";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { JOBS, formatAge, jobStatus, type JobState } from "@/lib/admin-automations";

export const metadata: Metadata = { title: "Admin · Automations" };
export const dynamic = "force-dynamic";

const STATE: Record<JobState, { label: string; tone: BadgeTone }> = {
  healthy: { label: "Healthy", tone: "success" },
  late: { label: "Late", tone: "danger" },
  never: { label: "Never ran", tone: "warning" },
  "not-configured": { label: "Not configured", tone: "neutral" },
};

export default async function AdminAutomationsPage() {
  await requireAdminPermission("system.view");
  const now = new Date();
  const since = new Date(now.getTime() - 86_400_000);
  const [stamps, enabled, total, runs, failures] = await Promise.all([
    db.systemSetting.findMany({ where: { key: { in: JOBS.map((j) => j.stamp) } }, select: { key: true, value: true } }),
    db.automation.count({ where: { enabled: true } }),
    db.automation.count(),
    db.automationRun.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.automationRun.findMany({
      where: { status: "failed", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, detail: true, createdAt: true, automation: { select: { name: true, workspace: { select: { name: true } } } } },
    }),
  ]);
  const byKey = new Map(stamps.map((s) => [s.key, s.value]));
  const count = (status: string) => runs.find((r) => r.status === status)?._count._all ?? 0;
  const rows = JOBS.map((def) => ({ def, status: jobStatus(def, byKey.get(def.stamp), now, flags.realBilling) }));
  const tickLate = rows[0]?.status.state === "late" || rows[0]?.status.state === "never";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Automations</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-[var(--text-muted)]">
          When each scheduled job last ran, read from the stamps the scheduler writes. This page only reports; to run the queue by hand or retry failed posts use{" "}
          <Link href="/admin/queue" className="underline">Queue engine</Link>.
        </p>
      </div>

      {tickLate && (
        <div role="alert" className="rounded-[var(--radius-lg)] border border-[var(--danger)] bg-[var(--bg-elevated)] p-3 text-[14px] text-[var(--text)]">
          The scheduler has not run recently. Scheduled posts will not publish and none of the jobs below are running until something calls <code>/api/cron/tick</code> (a cron or the worker).
        </div>
      )}

      <Table>
        <THead>
          <TR>
            <TH>Job</TH>
            <TH>Meant to run</TH>
            <TH>Last run</TH>
            <TH>State</TH>
          </TR>
        </THead>
        <tbody>
          {rows.map(({ def, status }) => (
            <TR key={def.key}>
              <TD>
                <div className="font-medium text-[var(--text)]">{def.name}</div>
                <div className="max-w-md text-[13px] text-[var(--text-muted)]">{def.description}</div>
              </TD>
              <TD className="text-[var(--text-muted)]">{def.cadence}</TD>
              <TD className="whitespace-nowrap">
                {status.lastRunAt ? (
                  <>
                    <div>{formatAge(status.ageMs ?? 0)}</div>
                    <div className="text-[12.5px] text-[var(--text-muted)]">{status.lastRunAt.toISOString().replace("T", " ").slice(0, 16)} UTC</div>
                  </>
                ) : (
                  <span className="text-[var(--text-muted)]">–</span>
                )}
              </TD>
              <TD>
                <Badge tone={STATE[status.state].tone}>{STATE[status.state].label}</Badge>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Customer automations, last 24 hours</h2>
        <p className="text-[14px] text-[var(--text-muted)]">
          {enabled} of {total} automations enabled · {count("success")} succeeded · {count("failed")} failed · {count("skipped")} skipped
        </p>
        {failures.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>Automation</TH>
                <TH>Workspace</TH>
                <TH>Failure</TH>
                <TH>When</TH>
              </TR>
            </THead>
            <tbody>
              {failures.map((f) => (
                <TR key={f.id}>
                  <TD>{f.automation.name}</TD>
                  <TD className="text-[var(--text-muted)]">{f.automation.workspace.name}</TD>
                  <TD className="max-w-md truncate text-[var(--text-muted)]" title={f.detail}>{f.detail.slice(0, 160)}</TD>
                  <TD className="whitespace-nowrap text-[var(--text-muted)]">{formatAge(now.getTime() - f.createdAt.getTime())}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
