import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { AdminToolbar, Pagination } from "../_controls";
import { flags } from "@/lib/env";
import { aiQueryOpts, aiWhere } from "@/lib/admin-exports/platform";
import { resolveLedgerRange } from "@/lib/ai/ledger-range";
import { successRate } from "@/lib/ai/call-log";
import { todayDay } from "@/lib/date-range";
import { CallRange } from "./call-range";

export const metadata: Metadata = { title: "Admin · AI Providers" };

// keyLast4/provider/status/timestamps only — encryptedApiKey is never
// selected into this query, so there is no code path here that could leak
// a decryptable key into a server-rendered admin table.
const SAFE_SELECT = {
  id: true,
  provider: true,
  status: true,
  keyLast4: true,
  defaultModel: true,
  lastValidatedAt: true,
  lastUsedAt: true,
  createdAt: true,
  workspace: { select: { name: true, org: { select: { name: true } } } },
} satisfies Prisma.AiProviderCredentialSelect;

function statusTone(status: string) {
  if (status === "connected") return "success" as const;
  if (status === "invalid" || status === "error") return "danger" as const;
  return "neutral" as const;
}

export default async function AdminAiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("ai.view");
  const raw = await searchParams;
  const query = parseAdminQuery(raw, aiQueryOpts);
  const where = aiWhere(query);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const now = new Date();
  const range = resolveLedgerRange({ callRange: one(raw.callRange), callFrom: one(raw.callFrom), callTo: one(raw.callTo) }, now);
  const callWhere = { createdAt: { gte: range.from, lte: range.to } };

  const [rows, total, statusAgg, providerAgg] = await Promise.all([
    db.aiProviderCredential.findMany({
      where,
      orderBy: { createdAt: query.dir },
      skip: query.skip,
      take: query.perPage,
      select: SAFE_SELECT,
    }),
    db.aiProviderCredential.count({ where }),
    db.aiProviderCredential.groupBy({ by: ["status"], _count: true }),
    db.aiProviderCredential.groupBy({ by: ["provider"], _count: true }),
  ]);
  // Call activity is a nice-to-have: the table not being migrated yet must not take the credentials page down.
  const ledger = await Promise.all([
    db.aiCallLog.groupBy({ by: ["provider", "ok"], where: callWhere, _count: { _all: true }, _avg: { latencyMs: true }, _max: { latencyMs: true } }),
    db.aiCallLog.groupBy({ by: ["provider", "reason"], where: { ...callWhere, ok: false }, _count: { _all: true }, orderBy: { _count: { reason: "desc" } }, take: 12 }),
    db.aiCallLog.groupBy({ by: ["workspaceId"], where: callWhere, _count: { _all: true }, orderBy: { _count: { workspaceId: "desc" } }, take: 8 }),
  ]).catch(() => null);
  const topWorkspaces = ledger && ledger[2].length ? await db.workspace.findMany({ where: { id: { in: ledger[2].map((w) => w.workspaceId) } }, select: { id: true, name: true, org: { select: { name: true } } } }) : [];
  const byProvider = new Map<string, { ok: number; failed: number; avgMs: number; maxMs: number; weight: number }>();
  for (const g of ledger?.[0] ?? []) {
    const cur = byProvider.get(g.provider) ?? { ok: 0, failed: 0, avgMs: 0, maxMs: 0, weight: 0 };
    if (g.ok) cur.ok += g._count._all;
    else cur.failed += g._count._all;
    // average latency across the ok and failed groups, weighted by call count
    const n = g._count._all;
    cur.avgMs = (cur.avgMs * cur.weight + (g._avg.latencyMs ?? 0) * n) / Math.max(1, cur.weight + n);
    cur.weight += n;
    cur.maxMs = Math.max(cur.maxMs, g._max.latencyMs ?? 0);
    byProvider.set(g.provider, cur);
  }
  const totalCalls = [...byProvider.values()].reduce((n, p) => n + p.ok + p.failed, 0);
  const totalOk = [...byProvider.values()].reduce((n, p) => n + p.ok, 0);
  const statusCounts = Object.fromEntries(statusAgg.map((s) => [s.status, s._count]));
  const providerCounts = Object.fromEntries(providerAgg.map((p) => [p.provider, p._count]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">AI Providers</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Bring-your-own-key adoption across workspaces. Keys are encrypted and never shown here — only connection
          status and the last 4 characters.
        </p>
      </div>

      {!flags.aiByok && (
        <p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-[13px] text-[var(--text-muted)]">
          BYOK isn&apos;t switched on for this deployment (AI_BYOK_ENABLED) — connected keys below are saved but AI
          features aren&apos;t using them yet.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total connected" value={total} />
        <Stat label="Connected" value={statusCounts.connected ?? 0} />
        <Stat label="Invalid" value={statusCounts.invalid ?? 0} />
        <Stat label="OpenAI" value={providerCounts.openai ?? 0} />
        <Stat label="Gemini" value={providerCounts.gemini ?? 0} />
        <Stat label="Anthropic" value={providerCounts.anthropic ?? 0} />
      </div>

      <section className="space-y-3">
        <AdminToolbar
          searchPlaceholder="Search workspace, org…"
          exportType="ai"
          dateRange
          filters={[
            { key: "status", label: "Status", options: ["connected", "invalid"].map((s) => ({ value: s, label: s })) },
            { key: "provider", label: "Provider", options: ["openai", "gemini", "anthropic"].map((p) => ({ value: p, label: p })) },
          ]}
        />
        <Table label="AI provider credentials">
          <THead>
            <TR>
              <TH>Org / workspace</TH>
              <TH>Provider</TH>
              <TH>Key</TH>
              <TH>Model</TH>
              <TH>Last validated</TH>
              <TH>Last used</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="text-[var(--text-muted)]">
                  {r.workspace.org.name}
                  <span className="text-[12px] text-[var(--text-subtle)]"> / {r.workspace.name}</span>
                </TD>
                <TD className="capitalize text-[var(--text-muted)]">{r.provider}</TD>
                <TD className="font-mono text-[13px] text-[var(--text-subtle)]">••••{r.keyLast4}</TD>
                <TD className="text-[var(--text-subtle)]">{r.defaultModel ?? "—"}</TD>
                <TD className="text-[var(--text-subtle)]">{r.lastValidatedAt ? relativeTime(r.lastValidatedAt) : "never"}</TD>
                <TD className="text-[var(--text-subtle)]">{r.lastUsedAt ? relativeTime(r.lastUsedAt) : "never"}</TD>
                <TD><Badge tone={statusTone(r.status)}>{r.status}</Badge></TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR><TD colSpan={7} className="py-8 text-center text-[var(--text-subtle)]">No AI providers connected yet.</TD></TR>
            )}
          </tbody>
        </Table>
        <Pagination page={query.page} perPage={query.perPage} total={total} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text)]">Call activity · {range.label}</h2>
            <p className="max-w-2xl text-[13px] text-[var(--text-muted)]">
              Calls made with workspaces&apos; own keys: how many, how many failed and why, and how long they took. The keys are the customers&apos;, so there is no platform cost to show, and prompts and answers are never stored. Kept for 90 days.
            </p>
          </div>
          <CallRange preset={range.preset} custom={range.custom} today={todayDay(now)} />
        </div>
        {range.invalid && <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">That date range isn&apos;t valid (it must start in the past and fit inside the last 90 days), so the last 7 days are shown.</p>}
        {ledger === null ? (
          <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">Call activity isn&apos;t available yet. If this is a new deploy, check that the latest database migration (admin governance) has been applied.</p>
        ) : totalCalls === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">No AI calls in this period.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Calls" value={totalCalls} />
              <Stat label="Succeeded" value={`${successRate(totalOk, totalCalls)}%`} />
              <Stat label="Failed" value={totalCalls - totalOk} />
            </div>
            <Table label="AI calls by provider">
              <THead>
                <TR>
                  <TH>Provider</TH>
                  <TH>Calls</TH>
                  <TH>Succeeded</TH>
                  <TH>Average time</TH>
                  <TH>Slowest</TH>
                </TR>
              </THead>
              <tbody>
                {[...byProvider.entries()].sort((a, b) => b[1].ok + b[1].failed - (a[1].ok + a[1].failed)).map(([provider, p]) => (
                  <TR key={provider}>
                    <TD className="capitalize">{provider}</TD>
                    <TD>{p.ok + p.failed}</TD>
                    <TD>
                      <Badge tone={p.failed === 0 ? "success" : p.failed / (p.ok + p.failed) > 0.2 ? "danger" : "warning"}>{successRate(p.ok, p.ok + p.failed)}%</Badge>
                    </TD>
                    <TD className="tabular-nums">{(p.avgMs / 1000).toFixed(1)}s</TD>
                    <TD className="tabular-nums">{(p.maxMs / 1000).toFixed(1)}s</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-[13px] font-semibold text-[var(--text)]">Why calls failed</h3>
                {ledger[1].length === 0 ? (
                  <p className="text-[13px] text-[var(--text-muted)]">No failures.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
                    {ledger[1].map((f) => (
                      <li key={`${f.provider}:${f.reason}`} className="flex justify-between px-3 py-2 text-[13px]">
                        <span className="capitalize">{f.provider} · {(f.reason ?? "unknown").replace(/_/g, " ")}</span>
                        <span className="tabular-nums text-[var(--text-muted)]">{f._count._all}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-[13px] font-semibold text-[var(--text)]">Busiest workspaces</h3>
                <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
                  {ledger[2].map((w) => {
                    const ws = topWorkspaces.find((x) => x.id === w.workspaceId);
                    return (
                      <li key={w.workspaceId} className="flex justify-between px-3 py-2 text-[13px]">
                        <span>{ws ? `${ws.org.name} / ${ws.name}` : "Deleted workspace"}</span>
                        <span className="tabular-nums text-[var(--text-muted)]">{w._count._all}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
