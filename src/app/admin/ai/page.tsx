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
  const raw = await searchParams;
  const query = parseAdminQuery(raw, {
    defaultSort: "createdAt",
    sortable: ["createdAt"],
    filterKeys: ["status", "provider"],
  });

  const where: Prisma.AiProviderCredentialWhereInput = {};
  if (query.q) {
    where.OR = [
      { workspace: { name: { contains: query.q, mode: "insensitive" } } },
      { workspace: { org: { name: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  if (query.filters.status) where.status = query.filters.status;
  if (query.filters.provider) where.provider = query.filters.provider;

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
    </div>
  );
}
