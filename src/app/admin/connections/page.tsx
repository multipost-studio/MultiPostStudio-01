import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/misc";
import { formatDate, relativeTime } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { AdminToolbar, Pagination } from "../_controls";
import { SocialDisconnect, ApiKeyRevoke, WebhookToggle } from "../_more-client";

export const metadata: Metadata = { title: "Admin · Connections" };

function socialTone(status: string) {
  if (status === "connected") return "success" as const;
  if (status === "error" || status === "expired") return "danger" as const;
  return "neutral" as const;
}

export default async function AdminConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseAdminQuery(raw, {
    defaultSort: "connectedAt",
    sortable: ["connectedAt"],
    filterKeys: ["status", "platform"],
  });

  const where: Prisma.SocialAccountWhereInput = {};
  if (query.q) where.OR = [
    { displayName: { contains: query.q, mode: "insensitive" } },
    { handle: { contains: query.q, mode: "insensitive" } },
    { workspace: { org: { name: { contains: query.q, mode: "insensitive" } } } },
  ];
  if (query.filters.status) where.status = query.filters.status;
  if (query.filters.platform) where.platform = query.filters.platform;

  const soon = new Date(Date.now() + 7 * 86_400_000);
  const [accounts, accTotal, statusAgg, expiring, keys, webhooks] = await Promise.all([
    db.socialAccount.findMany({
      where,
      orderBy: { connectedAt: query.dir },
      skip: query.skip,
      take: query.perPage,
      include: { workspace: { select: { name: true, org: { select: { name: true } } } }, _count: { select: { channels: true } } },
    }),
    db.socialAccount.count({ where }),
    db.socialAccount.groupBy({ by: ["status"], _count: true }),
    db.socialAccount.count({ where: { status: "connected", tokenExpiresAt: { not: null, lte: soon } } }),
    db.apiKey.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { org: { select: { name: true } } },
    }),
    db.webhook.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { org: { select: { name: true } }, _count: { select: { deliveries: true } } },
    }),
  ]);
  const counts = Object.fromEntries(statusAgg.map((s) => [s.status, s._count]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Connections</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">Social accounts, API keys, and webhooks across the platform.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Connected" value={counts.connected ?? 0} />
        <Stat label="Expired" value={counts.expired ?? 0} />
        <Stat label="Errored" value={counts.error ?? 0} />
        <Stat label="Token expiring ≤7d" value={expiring} />
        <Stat label="Active API keys" value={keys.length} />
        <Stat label="Webhooks" value={webhooks.length} />
      </div>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Social accounts</h2>
        <AdminToolbar
          searchPlaceholder="Search handle, name, org…"
          filters={[
            { key: "status", label: "Status", options: ["connected", "expired", "error", "disconnected"].map((s) => ({ value: s, label: s })) },
            {
              key: "platform",
              label: "Platform",
              options: ["instagram", "facebook", "linkedin", "x", "tiktok", "youtube", "pinterest", "threads", "gbp", "bluesky"].map((p) => ({ value: p, label: p })),
            },
          ]}
        />
        <Table>
          <THead>
            <TR>
              <TH>Account</TH>
              <TH>Platform</TH>
              <TH>Org / workspace</TH>
              <TH>Channels</TH>
              <TH>Token expires</TH>
              <TH>Status</TH>
              <TH>Action</TH>
            </TR>
          </THead>
          <tbody>
            {accounts.map((a) => (
              <TR key={a.id}>
                <TD>
                  <p className="font-medium text-[var(--text)]">{a.displayName}</p>
                  <p className="text-[12px] text-[var(--text-subtle)]">@{a.handle}</p>
                </TD>
                <TD className="capitalize text-[var(--text-muted)]">{a.platform}</TD>
                <TD className="text-[var(--text-muted)]">
                  {a.workspace.org.name}
                  <span className="text-[12px] text-[var(--text-subtle)]"> / {a.workspace.name}</span>
                </TD>
                <TD className="tabular-nums">{a._count.channels}</TD>
                <TD className="text-[var(--text-subtle)]">{a.tokenExpiresAt ? formatDate(a.tokenExpiresAt) : "—"}</TD>
                <TD><Badge tone={socialTone(a.status)}>{a.status}</Badge></TD>
                <TD><SocialDisconnect id={a.id} status={a.status} /></TD>
              </TR>
            ))}
            {accounts.length === 0 && (
              <TR><TD colSpan={7} className="py-8 text-center text-[var(--text-subtle)]">No accounts match.</TD></TR>
            )}
          </tbody>
        </Table>
        <Pagination page={query.page} perPage={query.perPage} total={accTotal} />
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">API keys</h2>
        <Table>
          <THead>
            <TR><TH>Name</TH><TH>Org</TH><TH>Prefix</TH><TH>Last used</TH><TH>Created</TH><TH>Action</TH></TR>
          </THead>
          <tbody>
            {keys.map((k) => (
              <TR key={k.id}>
                <TD className="font-medium text-[var(--text)]">{k.name}</TD>
                <TD className="text-[var(--text-muted)]">{k.org.name}</TD>
                <TD className="font-mono text-[13px]">{k.prefix}…</TD>
                <TD className="text-[var(--text-subtle)]">{k.lastUsedAt ? relativeTime(k.lastUsedAt) : "never"}</TD>
                <TD className="text-[var(--text-subtle)]">{formatDate(k.createdAt)}</TD>
                <TD><ApiKeyRevoke id={k.id} /></TD>
              </TR>
            ))}
            {keys.length === 0 && (
              <TR><TD colSpan={6} className="py-8 text-center text-[var(--text-subtle)]">No active API keys.</TD></TR>
            )}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Webhooks</h2>
        <Table>
          <THead>
            <TR><TH>Endpoint</TH><TH>Org</TH><TH>Deliveries</TH><TH>Active</TH></TR>
          </THead>
          <tbody>
            {webhooks.map((w) => (
              <TR key={w.id}>
                <TD className="max-w-[320px] truncate font-mono text-[13px]">{w.url}</TD>
                <TD className="text-[var(--text-muted)]">{w.org.name}</TD>
                <TD className="tabular-nums">{w._count.deliveries}</TD>
                <TD><WebhookToggle id={w.id} active={w.active} /></TD>
              </TR>
            ))}
            {webhooks.length === 0 && (
              <TR><TD colSpan={4} className="py-8 text-center text-[var(--text-subtle)]">No webhooks.</TD></TR>
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
