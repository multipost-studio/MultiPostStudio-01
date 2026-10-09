import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { formatDate, formatTime } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { AdminToolbar, Pagination } from "../_controls";
import { auditQueryOpts, auditWhere } from "@/lib/admin-exports/activity";

export const metadata: Metadata = { title: "Admin · Audit log" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("audit.view");
  const raw = await searchParams;
  const query = parseAdminQuery(raw, auditQueryOpts);
  const where = auditWhere(query);

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: query.dir },
      skip: query.skip,
      take: query.perPage,
      include: { actor: { select: { name: true } }, org: { select: { name: true } } },
    }),
    db.auditLog.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--text)]">Audit log</h1>
      <p className="text-[14px] text-[var(--text-muted)]">
        Immutable record of security- and billing-sensitive actions across the platform.
      </p>

      <AdminToolbar
        searchPlaceholder="Search action, target id or actor…"
        exportType="audit"
        dateRange
        filters={[
          { key: "scope", label: "Scope", options: [
            { value: "admin", label: "admin.*" },
            { value: "auth", label: "auth.*" },
            { value: "billing", label: "billing.*" },
          ] },
        ]}
      />

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
              <TD className="text-[var(--text-subtle)]">{l.targetType}:{l.targetId.slice(0, 10)}</TD>
            </TR>
          ))}
          {logs.length === 0 && (
            <TR><TD colSpan={5} className="py-8 text-center text-[var(--text-subtle)]">No entries match.</TD></TR>
          )}
        </tbody>
      </Table>

      <Pagination page={query.page} perPage={query.perPage} total={total} />
    </div>
  );
}
