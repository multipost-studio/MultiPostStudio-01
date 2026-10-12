import type { Metadata } from "next";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { getCurrentUser, getStaffPermissions, requireAdminPermission } from "@/lib/session";
import { formatMoney } from "@/lib/revenue";
import { SELF_APPROVAL_KEY, STATUS_LABEL, type RefundStatus } from "@/lib/refund-rules";
import { formatDate, relativeTime } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { DecideButtons, SelfApprovalToggle, WithdrawButton } from "./refund-client";

export const metadata: Metadata = { title: "Admin · Refunds" };
export const dynamic = "force-dynamic";

const TONE: Record<RefundStatus, BadgeTone> = { pending: "warning", processing: "info", refunded: "success", failed: "danger", rejected: "neutral", canceled: "neutral" };

export default async function RefundsPage() {
  await requireAdminPermission("billing.view");
  const perms = await getStaffPermissions();
  const me = await getCurrentUser();
  const rows = await db.refundRequest.findMany({ orderBy: { createdAt: "desc" }, take: 80 }).catch(() => null);

  const invoiceIds = [...new Set((rows ?? []).map((r) => r.invoiceId))];
  const orgIds = [...new Set((rows ?? []).map((r) => r.orgId))];
  const staffIds = [...new Set((rows ?? []).flatMap((r) => [r.requestedById, r.decidedById]).filter((x): x is string => !!x))];
  const [invoices, orgs, staff, selfApproval] = await Promise.all([
    invoiceIds.length ? db.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, number: true } }) : [],
    orgIds.length ? db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [],
    staffIds.length ? db.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true } }) : [],
    db.systemSetting.findUnique({ where: { key: SELF_APPROVAL_KEY }, select: { value: true } }).catch(() => null),
  ]);
  const who = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name || staff.find((s) => s.id === id)?.email || "Former staff member" : "—");
  const selfAllowed = selfApproval?.value === "true";
  const pending = (rows ?? []).filter((r) => r.status === "pending");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Refunds</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-[var(--text-muted)]">
          A refund is requested from an invoice on the Billing page and only goes to the payment gateway after a different person approves it. Each request keeps who asked, who decided and why. Refunds can&apos;t exceed what is left on the invoice.
        </p>
      </div>

      {!flags.realBilling && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">
          No payment gateway is configured on this deployment, so refunds can&apos;t be sent. Requests are refused until Stripe or Razorpay is set up.
        </p>
      )}

      {perms.has("access.manage") && <SelfApprovalToggle allowed={selfAllowed} />}

      {rows === null ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">
          Refunds aren&apos;t available yet. If this is a new deploy, check that the latest database migration (admin money and controls) has been applied.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-[var(--text-muted)]">No refund requests yet.</p>
      ) : (
        <>
          <p className="text-[13px] text-[var(--text-muted)]">{pending.length} waiting for approval.</p>
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)]">
            {rows.map((r) => {
              const status = r.status as RefundStatus;
              const label = `${formatMoney(r.amountMinor, r.currency)} for ${invoices.find((i) => i.id === r.invoiceId)?.number ?? "this invoice"}`;
              const own = !!me && r.requestedById === me.id;
              return (
                <li key={r.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-[14px] text-[var(--text)]">
                        <span className="font-medium">{formatMoney(r.amountMinor, r.currency)}</span>
                        <span className="text-[var(--text-muted)]">{invoices.find((i) => i.id === r.invoiceId)?.number} · {orgs.find((o) => o.id === r.orgId)?.name ?? "Organization"}</span>
                        <Badge tone={TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? r.status}</Badge>
                      </div>
                      <p className="text-[13px] text-[var(--text-muted)]">“{r.reason}”</p>
                      <p className="text-[12.5px] text-[var(--text-muted)]">
                        Asked by {who(r.requestedById)} {relativeTime(r.createdAt)}
                        {r.decidedAt && ` · decided by ${who(r.decidedById)} ${formatDate(r.decidedAt)}`}
                        {r.decisionNote && ` · “${r.decisionNote}”`}
                      </p>
                      {r.error && <p className="text-[12.5px] text-[var(--danger)]">Gateway said: {r.error}</p>}
                      {r.providerRefundId && <p className="font-mono text-[12px] text-[var(--text-muted)]">{r.provider} refund {r.providerRefundId}</p>}
                    </div>
                    {status === "pending" && (
                      <div className="flex flex-col items-end gap-2">
                        {perms.has("refunds.approve") && (!own || selfAllowed) && <DecideButtons id={r.id} label={label} />}
                        {own && perms.has("refunds.request") && <WithdrawButton id={r.id} />}
                        {own && !selfAllowed && <p className="max-w-[220px] text-right text-[12px] text-[var(--text-muted)]">Waiting for someone else to approve.</p>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
