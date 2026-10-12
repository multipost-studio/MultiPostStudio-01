import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env, flags } from "@/lib/env";
import { getStaffPermissions, requireAdminPermission } from "@/lib/session";
import { TEMPLATES } from "@/lib/email-templates";
import { resolveLedgerRange } from "@/lib/ai/ledger-range";
import { successRate } from "@/lib/ai/call-log";
import { todayDay } from "@/lib/date-range";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { CallRange } from "../ai/call-range";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Admin · Emails" };
export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = { verify: "Verify email", reset: "Password reset", invite_new: "Invitation (new)", invite_existing: "Invitation (existing)", digest: "Weekly digest", report: "Scheduled report", notification: "Notifications", contact: "Contact form", feedback: "Feedback", test: "Test sends", other: "Other" };

export default async function EmailsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPermission("marketing.view");
  const canManage = (await getStaffPermissions()).has("marketing.manage");
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const now = new Date();
  const range = resolveLedgerRange({ callRange: one(raw.callRange), callFrom: one(raw.callFrom), callTo: one(raw.callTo) }, now);
  const where = { createdAt: { gte: range.from, lte: range.to } };

  const [stats, opened, clicked] = await Promise.all([
    db.emailLog.groupBy({ by: ["template", "status"], where, _count: { _all: true } }),
    db.emailLog.groupBy({ by: ["template"], where: { ...where, opened: true }, _count: { _all: true } }),
    db.emailLog.groupBy({ by: ["template"], where: { ...where, clicked: true }, _count: { _all: true } }),
  ]).catch(() => [null, null, null] as const);

  const versions = await db.emailTemplateVersion.findMany({ orderBy: [{ key: "asc" }, { version: "desc" }], take: 200 }).catch(() => null);
  const authorIds = [...new Set((versions ?? []).map((v) => v.createdById).filter((x): x is string => !!x))];
  const authors = authorIds.length ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } }) : [];
  const who = (id: string | null) => (id ? authors.find((a) => a.id === id)?.name || authors.find((a) => a.id === id)?.email || "Former staff member" : "—");

  type Row = { template: string; total: number; sent: number; delivered: number; failed: number; bounced: number; complained: number; stub: number; opened: number; clicked: number };
  const rows = new Map<string, Row>();
  const blank = (template: string): Row => ({ template, total: 0, sent: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, stub: 0, opened: 0, clicked: 0 });
  for (const g of stats ?? []) {
    const r = rows.get(g.template) ?? blank(g.template);
    r.total += g._count._all;
    if (g.status in r) (r as unknown as Record<string, number>)[g.status] += g._count._all;
    rows.set(g.template, r);
  }
  for (const g of opened ?? []) (rows.get(g.template) ?? rows.set(g.template, blank(g.template)).get(g.template)!).opened = g._count._all;
  for (const g of clicked ?? []) (rows.get(g.template) ?? rows.set(g.template, blank(g.template)).get(g.template)!).clicked = g._count._all;
  const table = [...rows.values()].sort((a, b) => b.total - a.total);
  const tracking = !!(env.RESEND_WEBHOOK_SECRET ?? process.env.RESEND_WEBHOOK_SECRET);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Emails</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-[var(--text-muted)]">
          Edit the account emails customers receive, with a version history you can restore from, and see how the emails are being delivered. Only the template, the outcome and delivery events are logged: never an address or the content.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Delivery · {range.label}</h2>
          <CallRange preset={range.preset} custom={range.custom} today={todayDay(now)} label="Delivery period" />
        </div>
        {range.invalid && <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">That date range isn&apos;t valid (it must start in the past and fit inside the last 90 days), so the last 7 days are shown.</p>}
        {!flags.realEmail && <p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-[13px] text-[var(--text-muted)]">No email provider is configured on this deployment, so emails are logged as &quot;not sent&quot; (stub).</p>}
        {flags.emailProvider === "resend" && !tracking && <p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-[13px] text-[var(--text-muted)]">Delivered, bounced and opened counts need Resend&apos;s webhook. Set RESEND_WEBHOOK_SECRET and add a webhook pointing at /api/webhooks/resend in Resend; until then only sent and failed are known.</p>}
        {flags.emailProvider === "gmail" && <p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-[13px] text-[var(--text-muted)]">Gmail doesn&apos;t report delivery, bounces or opens, so only sent and failed are shown.</p>}
        {stats === null ? (
          <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">Delivery figures aren&apos;t available yet. If this is a new deploy, check that the latest database migration (admin money and controls) has been applied.</p>
        ) : table.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">No emails were logged in this period.</p>
        ) : (
          <Table label="Email delivery by template">
            <THead>
              <TR>
                <TH>Email</TH>
                <TH>Total</TH>
                <TH>Delivered</TH>
                <TH>Failed</TH>
                <TH>Bounced</TH>
                <TH>Complaints</TH>
                <TH>Opened</TH>
                <TH>Clicked</TH>
              </TR>
            </THead>
            <tbody>
              {table.map((r) => {
                const good = r.delivered + r.sent;
                const bad = r.failed + r.bounced + r.complained;
                return (
                  <TR key={r.template}>
                    <TD>{LABELS[r.template] ?? r.template}{r.stub > 0 && <span className="ml-2 text-[12px] text-[var(--text-muted)]">{r.stub} not sent (no provider)</span>}</TD>
                    <TD className="tabular-nums">{r.total}</TD>
                    <TD className="tabular-nums"><Badge tone={bad === 0 ? "success" : bad / Math.max(1, good + bad) > 0.05 ? "danger" : "warning"}>{r.delivered > 0 ? r.delivered : r.sent}{good + bad > 0 && ` · ${successRate(good, good + bad)}%`}</Badge></TD>
                    <TD className="tabular-nums">{r.failed}</TD>
                    <TD className="tabular-nums">{r.bounced}</TD>
                    <TD className="tabular-nums">{r.complained}</TD>
                    <TD className="tabular-nums">{tracking ? r.opened : "–"}</TD>
                    <TD className="tabular-nums">{tracking ? r.clicked : "–"}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Templates</h2>
        {versions === null ? (
          <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">Templates aren&apos;t editable yet. If this is a new deploy, check that the latest database migration (admin money and controls) has been applied. Emails keep using the built-in text meanwhile.</p>
        ) : (
          TEMPLATES.map((t) => {
            const list = versions.filter((v) => v.key === t.key);
            const active = list.find((v) => v.isActive) ?? null;
            return (
              <TemplateEditor
                key={t.key}
                def={{ key: t.key, label: t.label, when: t.when, placeholders: [...t.placeholders], defaultSubject: t.defaultSubject, defaultBody: t.defaultBody }}
                active={active ? { id: active.id, version: active.version, subject: active.subject, body: active.body } : null}
                history={list.map((v) => ({ id: v.id, version: v.version, isActive: v.isActive, note: v.note, by: who(v.createdById), at: formatDate(v.createdAt) }))}
                canManage={canManage}
              />
            );
          })
        )}
      </section>
    </div>
  );
}
