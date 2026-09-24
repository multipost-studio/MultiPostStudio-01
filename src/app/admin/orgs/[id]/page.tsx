import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate, relativeTime, formatCurrency } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { OrgDetailHeaderActions, OrgPlanSwitcher } from "./org-detail-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const org = await db.organization.findUnique({
    where: { id },
    select: { name: true, slug: true },
  });
  return {
    title: org ? `Admin · ${org.name} (${org.slug})` : "Admin · Organization Profile",
  };
}

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: orgId } = await params;

  const [org, totalPosts, auditLogs] = await Promise.all([
    db.organization.findUnique({
      where: { id: orgId },
      include: {
        subscription: { include: { plan: true } },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                isPlatformAdmin: true,
                suspendedAt: true,
                emailVerified: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        workspaces: {
          include: {
            channels: { select: { id: true, platform: true, name: true, handle: true } },
            _count: { select: { posts: true, members: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        apiKeys: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: {
            memberships: true,
            workspaces: true,
          },
        },
      },
    }),
    db.post.count({ where: { workspace: { orgId } } }),
    db.auditLog.findMany({
      where: {
        OR: [
          { orgId },
          { targetId: orgId, targetType: "organization" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  if (!org) {
    notFound();
  }

  const isSuspended = org.memberships.length > 0 && org.memberships.every((m) => m.status === "suspended");
  const totalChannels = org.workspaces.reduce((acc, w) => acc + w.channels.length, 0);
  const currentPlanKey = org.subscription?.plan.key ?? "free";

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-subtle)]">
        <Link href="/admin/orgs" className="hover:text-[var(--text)] transition-colors">
          ← Back to Organizations
        </Link>
        <span>/</span>
        <span className="text-[var(--text)] font-mono text-xs">{org.id}</span>
      </div>

      {/* Header Profile Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 md:flex-row md:items-center md:justify-between shadow-sm">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--text)]">{org.name}</h1>
            <Badge tone="neutral" className="capitalize">{org.type.replace(/_/g, " ")}</Badge>
            <Badge tone={org.subscription?.status === "active" ? "success" : "neutral"}>
              {org.subscription?.plan.name ?? "Free"}
            </Badge>
            {isSuspended && <Badge tone="danger">suspended</Badge>}
            {org.deletedAt && <Badge tone="neutral">deleted</Badge>}
          </div>
          <p className="text-sm font-mono text-[var(--text-muted)]">{org.slug}</p>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-subtle)] pt-1">
            <span>Created: <strong>{formatDate(org.createdAt)}</strong> ({relativeTime(org.createdAt)})</span>
            <span>•</span>
            <span>Account Credits: <strong>{org.creditBalance}</strong></span>
            {org.billingCountry && (
              <>
                <span>•</span>
                <span>Country: <strong className="uppercase">{org.billingCountry}</strong></span>
              </>
            )}
            {org.taxId && (
              <>
                <span>•</span>
                <span>Tax ID: <strong className="font-mono">{org.taxId}</strong></span>
              </>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <OrgDetailHeaderActions
          org={{
            id: org.id,
            name: org.name,
            slug: org.slug,
            type: org.type,
            isSuspended,
            isDeleted: !!org.deletedAt,
            currentPlanKey,
            creditBalance: org.creditBalance,
            billingName: org.billingName,
            billingEmail: org.billingEmail,
            billingCountry: org.billingCountry,
            taxId: org.taxId,
          }}
        />
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Workspaces</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{org._count.workspaces}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Team Members</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{org._count.memberships}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Connected Channels</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{totalChannels}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Total Posts</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{totalPosts}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Invoices Count</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{org.invoices.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">API Keys</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{org.apiKeys.length}</p>
        </div>
      </div>

      {/* Subscription & Plan Override Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Subscription & Quota Override</CardTitle>
              <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                Current status: <strong>{org.subscription?.status ?? "free"}</strong>
                {org.subscription?.currentPeriodEnd && ` · Renews ${formatDate(org.subscription.currentPeriodEnd)}`}
                {org.subscription?.stripeSubscriptionId && ` · Stripe: ${org.subscription.stripeSubscriptionId}`}
              </p>
            </div>
            <OrgPlanSwitcher orgId={org.id} currentPlanKey={currentPlanKey} />
          </div>
        </CardHeader>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members ({org.memberships.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Org Role</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
                <TH>Profile</TH>
              </TR>
            </THead>
            <tbody>
              {org.memberships.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Avatar name={m.user.name} src={m.user.image} size={28} />
                      <div>
                        <p className="font-medium text-sm text-[var(--text)]">
                          {m.user.name}
                          {m.user.isPlatformAdmin && <Badge tone="neutral" className="ml-1 text-[10px]">admin</Badge>}
                        </p>
                        <p className="text-xs text-[var(--text-subtle)]">{m.user.email}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={m.role === "owner" ? "neutral" : "neutral"} className="capitalize">
                      {m.role}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={m.status === "active" ? "success" : "danger"}>
                      {m.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-[var(--text-subtle)]">{formatDate(m.createdAt)}</TD>
                  <TD>
                    <Link
                      href={`/admin/users/${m.user.id}`}
                      className="text-xs text-[var(--primary)] hover:underline"
                    >
                      View User →
                    </Link>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {/* Workspaces & Connected Channels */}
      <Card>
        <CardHeader>
          <CardTitle>Workspaces & Social Channels ({org.workspaces.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Workspace Name</TH>
                <TH>Kind</TH>
                <TH>Social Channels</TH>
                <TH>Posts</TH>
                <TH>Members</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <tbody>
              {org.workspaces.map((w) => (
                <TR key={w.id}>
                  <TD>
                    <p className="font-medium text-sm text-[var(--text)]">{w.name}</p>
                    <p className="text-xs font-mono text-[var(--text-subtle)]">{w.slug}</p>
                  </TD>
                  <TD className="capitalize text-xs text-[var(--text-muted)]">{w.kind}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {w.channels.map((c) => (
                        <Badge key={c.id} tone="neutral" className="text-[10px]">
                          {c.platform}: {c.name || c.handle}
                        </Badge>
                      ))}
                      {w.channels.length === 0 && (
                        <span className="text-xs text-[var(--text-subtle)]">No channels connected</span>
                      )}
                    </div>
                  </TD>
                  <TD className="tabular-nums text-sm">{w._count.posts}</TD>
                  <TD className="tabular-nums text-sm">{w._count.members}</TD>
                  <TD className="text-xs text-[var(--text-subtle)]">{formatDate(w.createdAt)}</TD>
                </TR>
              ))}
              {org.workspaces.length === 0 && (
                <TR>
                  <TD colSpan={6} className="py-6 text-center text-sm text-[var(--text-subtle)]">
                    No workspaces configured for this organization.
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {/* Invoices and API Keys */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Invoices */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Invoices ({org.invoices.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Invoice #</TH>
                  <TH>Amount</TH>
                  <TH>Status</TH>
                  <TH>Date</TH>
                </TR>
              </THead>
              <tbody>
                {org.invoices.map((inv) => (
                  <TR key={inv.id}>
                    <TD className="font-mono text-xs text-[var(--text)]">{inv.number || inv.id.slice(0, 10)}</TD>
                    <TD className="font-semibold text-sm">
                      {formatCurrency(inv.amountDue || 0, inv.currency || "usd")}
                    </TD>
                    <TD>
                      <Badge tone={inv.status === "paid" ? "success" : "neutral"} className="capitalize">
                        {inv.status}
                      </Badge>
                    </TD>
                    <TD className="text-xs text-[var(--text-subtle)]">{formatDate(inv.createdAt)}</TD>
                  </TR>
                ))}
                {org.invoices.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="py-6 text-center text-sm text-[var(--text-subtle)]">
                      No invoices recorded.
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader>
            <CardTitle>Active API Keys ({org.apiKeys.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Key Prefix</TH>
                  <TH>Last Used</TH>
                </TR>
              </THead>
              <tbody>
                {org.apiKeys.map((k) => (
                  <TR key={k.id}>
                    <TD className="font-medium text-xs text-[var(--text)]">{k.name}</TD>
                    <TD className="font-mono text-xs text-[var(--text-muted)]">{k.prefix}••••••••</TD>
                    <TD className="text-xs text-[var(--text-subtle)]">
                      {k.lastUsedAt ? relativeTime(k.lastUsedAt) : "Never"}
                    </TD>
                  </TR>
                ))}
                {org.apiKeys.length === 0 && (
                  <TR>
                    <TD colSpan={3} className="py-6 text-center text-sm text-[var(--text-subtle)]">
                      No API keys provisioned.
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Audit History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Organization Audit Trail ({auditLogs.length} events)</CardTitle>
            <Link href={`/admin/audit?q=${encodeURIComponent(org.id)}`} className="text-xs text-[var(--primary)] hover:underline">
              Open Audit Hub →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Timestamp</TH>
                <TH>Action</TH>
                <TH>Actor</TH>
                <TH>Target Type</TH>
                <TH>Metadata</TH>
              </TR>
            </THead>
            <tbody>
              {auditLogs.map((log) => (
                <TR key={log.id}>
                  <TD className="text-xs text-[var(--text-subtle)] whitespace-nowrap">
                    {formatDate(log.createdAt)} ({relativeTime(log.createdAt)})
                  </TD>
                  <TD className="font-mono text-xs font-semibold text-[var(--text)]">{log.action}</TD>
                  <TD className="font-mono text-xs text-[var(--text-muted)]">{log.actorId ? log.actorId.slice(0, 10) : "System"}</TD>
                  <TD className="text-xs text-[var(--text-muted)] capitalize">{log.targetType}</TD>
                  <TD className="text-xs font-mono text-[var(--text-muted)] truncate max-w-[280px]">
                    {log.metadata ? JSON.stringify(log.metadata) : "—"}
                  </TD>
                </TR>
              ))}
              {auditLogs.length === 0 && (
                <TR>
                  <TD colSpan={5} className="py-6 text-center text-sm text-[var(--text-subtle)]">
                    No audit records logged for this organization.
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
