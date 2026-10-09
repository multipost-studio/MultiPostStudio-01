import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { AdminToolbar, Pagination } from "../_controls";
import { ResolveForm } from "./privacy-requests-client";
import { privacyQueryOpts, privacyWhere } from "@/lib/admin-exports/activity";

export const metadata: Metadata = { title: "Admin · Privacy Requests" };

const STATUS_TONE = { submitted: "neutral", in_progress: "info", completed: "success", rejected: "danger" } as const;

export default async function AdminPrivacyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("privacy.view");
  const raw = await searchParams;
  const query = parseAdminQuery(raw, privacyQueryOpts);
  const where = privacyWhere(query);

  const [requests, total, openCount] = await Promise.all([
    db.privacyRequest.findMany({
      where,
      orderBy: { createdAt: query.dir },
      skip: query.skip,
      take: query.perPage,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.privacyRequest.count({ where }),
    db.privacyRequest.count({ where: { status: { in: ["submitted", "in_progress"] } } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Privacy Requests</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Data-principal rights requests (access, correction, erasure, consent withdrawal, complaints). The DPDP
          Rules specify a 90-day response window — <strong>{openCount}</strong> currently open.
        </p>
      </div>

      <AdminToolbar
        searchPlaceholder="Search requester name, email or details…"
        exportType="privacy"
        dateRange
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "submitted", label: "submitted" },
              { value: "in_progress", label: "in progress" },
              { value: "completed", label: "completed" },
              { value: "rejected", label: "rejected" },
            ],
          },
          {
            key: "type",
            label: "Type",
            options: [
              { value: "access", label: "access" },
              { value: "correction", label: "correction" },
              { value: "erasure", label: "erasure" },
              { value: "consent_withdrawal", label: "consent withdrawal" },
              { value: "complaint", label: "complaint" },
            ],
          },
        ]}
      />

      <Table>
        <THead>
          <TR>
            <TH>User</TH>
            <TH>Type</TH>
            <TH>Details</TH>
            <TH>Status</TH>
            <TH>Filed</TH>
            <TH>Resolve</TH>
          </TR>
        </THead>
        <tbody>
          {requests.map((r) => (
            <TR key={r.id}>
              <TD>
                <p className="font-medium text-[var(--text)]">{r.user.name}</p>
                <p className="text-[12px] text-[var(--text-subtle)]">{r.user.email}</p>
              </TD>
              <TD className="text-[13px] text-[var(--text-muted)]">{r.type.replace("_", " ")}</TD>
              <TD className="max-w-[280px] text-[13px] text-[var(--text-muted)]">
                {r.details ?? "—"}
                {r.resolutionNote && <p className="mt-1 text-[12px] text-[var(--text-subtle)]">Resolution: {r.resolutionNote}</p>}
              </TD>
              <TD>
                <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status.replace("_", " ")}</Badge>
              </TD>
              <TD className="text-[var(--text-subtle)]">{formatDate(r.createdAt)}</TD>
              <TD>
                <ResolveForm id={r.id} currentStatus={r.status} />
              </TD>
            </TR>
          ))}
          {requests.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-8 text-center text-[var(--text-subtle)]">
                No requests match.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>

      <Pagination page={query.page} perPage={query.perPage} total={total} />
    </div>
  );
}
