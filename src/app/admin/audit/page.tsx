import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { formatDate, formatTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · Audit log" };

export default async function AdminAuditPage() {
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true } }, org: { select: { name: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--text)]">Audit log</h1>
      <p className="text-[14px] text-[var(--text-muted)]">
        Immutable record of security- and billing-sensitive actions across the platform.
      </p>
      <Table>
        <THead>
          <TR>
            <TH>When</TH>
            <TH>Actor</TH>
            <TH>Org</TH>
            <TH>Action</TH>
            <TH>Target</TH>
          </TR>
        </THead>
        <tbody>
          {logs.map((l) => (
            <TR key={l.id}>
              <TD className="whitespace-nowrap text-[var(--text-subtle)]">
                {formatDate(l.createdAt)} {formatTime(l.createdAt)}
              </TD>
              <TD>{l.actor?.name ?? "system"}</TD>
              <TD className="text-[var(--text-muted)]">{l.org?.name ?? "—"}</TD>
              <TD className="font-mono text-[13px]">{l.action}</TD>
              <TD className="text-[var(--text-subtle)]">
                {l.targetType}:{l.targetId.slice(0, 10)}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
