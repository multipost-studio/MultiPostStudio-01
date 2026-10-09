import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getStaffPermissions, requireAdminPermission } from "@/lib/session";
import { BACKUP_STALE_DAYS, CHECK_KINDS, RESTORE_TEST_STALE_DAYS, freshness, type Freshness } from "@/lib/recovery-status";
import { todayDay } from "@/lib/date-range";
import { formatDate, relativeTime } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { RecordCheckForm } from "./record-check-form";

export const metadata: Metadata = { title: "Admin · Backups & recovery" };
export const dynamic = "force-dynamic";

const STATE: Record<Freshness["state"], { label: string; tone: BadgeTone }> = {
  fresh: { label: "Up to date", tone: "success" },
  stale: { label: "Overdue", tone: "warning" },
  failing: { label: "Last attempt failed", tone: "danger" },
  never: { label: "No evidence yet", tone: "neutral" },
};

export default async function RecoveryPage() {
  await requireAdminPermission("system.view");
  const canManage = (await getStaffPermissions()).has("system.manage");
  const now = new Date();
  const checks = await db.backupCheck.findMany({ orderBy: { occurredAt: "desc" }, take: 60 }).catch(() => null);
  const staffIds = [...new Set((checks ?? []).map((c) => c.recordedById).filter((x): x is string => !!x))];
  const staff = staffIds.length ? await db.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true } }) : [];
  const who = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name || staff.find((s) => s.id === id)?.email || "Former staff member" : "—");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Backups &amp; recovery</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-[var(--text-muted)]">
          A record of when someone confirmed a database backup exists and when a restore was last tested. This app can&apos;t see the database host&apos;s backups itself, so these entries are written by people. Nothing here changes any backup.
        </p>
      </div>

      {checks === null ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">
          This page isn&apos;t available yet. If this is a new deploy, check that the latest database migration (admin governance) has been applied.
        </p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {CHECK_KINDS.map((k) => {
              const f = freshness(checks, k.id, now);
              const limit = k.id === "backup" ? BACKUP_STALE_DAYS : RESTORE_TEST_STALE_DAYS;
              return (
                <div key={k.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[14px] font-semibold text-[var(--text)]">{k.label}</h2>
                    <Badge tone={STATE[f.state].tone}>{STATE[f.state].label}</Badge>
                  </div>
                  <p className="mt-2 text-[13px] text-[var(--text-muted)]">
                    {f.lastOkAt ? `Last success ${f.ageDays === 0 ? "today" : `${f.ageDays} day${f.ageDays === 1 ? "" : "s"} ago`} (${formatDate(f.lastOkAt)}).` : "No successful check recorded."} Counted as overdue after {limit} days.
                  </p>
                </div>
              );
            })}
          </div>

          {canManage && <RecordCheckForm today={todayDay(now)} />}

          <section className="space-y-2">
            <h2 className="text-[15px] font-semibold text-[var(--text)]">History</h2>
            {checks.length === 0 ? (
              <p className="text-[14px] text-[var(--text-muted)]">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)]">
                {checks.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-[14px] text-[var(--text)]">
                        {CHECK_KINDS.find((k) => k.id === c.kind)?.label ?? c.kind}
                        <Badge tone={c.result === "ok" ? "success" : "danger"}>{c.result === "ok" ? "succeeded" : "failed"}</Badge>
                      </div>
                      {c.notes && <p className="max-w-2xl whitespace-pre-wrap text-[13px] text-[var(--text-muted)]">{c.notes}</p>}
                    </div>
                    <div className="text-right text-[12.5px] text-[var(--text-muted)]">
                      <div>{formatDate(c.occurredAt)}</div>
                      <div>recorded {relativeTime(c.createdAt)} by {who(c.recordedById)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
