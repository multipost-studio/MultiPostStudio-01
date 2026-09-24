import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate, relativeTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { UserDetailHeaderActions, RevokeDeviceButton } from "./user-detail-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: { name: true, email: true },
  });
  return {
    title: user ? `Admin · ${user.name} (${user.email})` : "Admin · User Profile",
  };
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = await params;

  const [user, auditLogs] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      include: {
        accounts: true,
        devices: { orderBy: { lastSeenAt: "desc" }, take: 10 },
        memberships: {
          include: {
            org: {
              include: {
                subscription: { include: { plan: true } },
                _count: { select: { workspaces: true, memberships: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        workspaceMembers: {
          include: {
            workspace: { select: { id: true, name: true, orgId: true } },
          },
        },
        posts: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            channels: { select: { platform: true, body: true } },
            workspace: { select: { name: true } },
          },
        },
        _count: {
          select: {
            posts: true,
            supportTickets: true,
            ideas: true,
            sessions: true,
            memberships: true,
            devices: true,
          },
        },
      },
    }),
    db.auditLog.findMany({
      where: {
        OR: [
          { actorId: userId },
          { targetId: userId, targetType: "user" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  if (!user) {
    notFound();
  }

  const isLocked = !!(user.twoFactorLockedUntil && user.twoFactorLockedUntil > new Date());

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-subtle)]">
        <Link href="/admin/users" className="hover:text-[var(--text)] transition-colors">
          ← Back to Users
        </Link>
        <span>/</span>
        <span className="text-[var(--text)] font-mono text-xs">{user.id}</span>
      </div>

      {/* Header Profile Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 md:flex-row md:items-center md:justify-between shadow-sm">
        <div className="flex items-start gap-4">
          <Avatar name={user.name} src={user.image} size={64} className="ring-2 ring-[var(--border)]" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--text)]">{user.name}</h1>
              {user.isPlatformAdmin && <Badge tone="neutral">platform admin</Badge>}
              {user.suspendedAt && <Badge tone="danger">suspended</Badge>}
              {user.deletedAt && <Badge tone="neutral">deleted</Badge>}
              {user.emailVerified ? <Badge tone="success">verified</Badge> : <Badge tone="warning">unverified</Badge>}
              {user.twoFactorEnabled ? <Badge tone="info">2FA active</Badge> : <Badge tone="neutral">2FA off</Badge>}
              {isLocked && <Badge tone="danger">TOTP locked</Badge>}
            </div>
            <p className="text-sm text-[var(--text-muted)] font-mono">{user.email}</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-subtle)] pt-1">
              <span>Joined: <strong>{formatDate(user.createdAt)}</strong> ({relativeTime(user.createdAt)})</span>
              <span>•</span>
              <span>Timezone: <strong>{user.timezone || "UTC"}</strong></span>
              <span>•</span>
              <span>Locale: <strong>{user.locale}</strong></span>
              {user.referralCode && (
                <>
                  <span>•</span>
                  <span>Referral Code: <strong className="font-mono">{user.referralCode}</strong></span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <UserDetailHeaderActions
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            isPlatformAdmin: user.isPlatformAdmin,
            suspendedAt: user.suspendedAt ? user.suspendedAt.toISOString() : null,
            deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
            emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
            twoFactorEnabled: user.twoFactorEnabled,
            isLocked,
          }}
        />
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Organizations</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{user._count.memberships}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Workspaces</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{user.workspaceMembers.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Authored Posts</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{user._count.posts}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Content Ideas</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{user._count.ideas}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Devices / Sessions</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{user._count.devices} / {user._count.sessions}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12px] text-[var(--text-subtle)] font-medium">Support Tickets</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">{user._count.supportTickets}</p>
        </div>
      </div>

      {/* Main Grid: Organizations & Workspaces */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Organizations */}
        <Card>
          <CardHeader>
            <CardTitle>Organizations & Roles ({user.memberships.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Organization</TH>
                  <TH>Role</TH>
                  <TH>Plan</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <tbody>
                {user.memberships.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <Link href={`/admin/orgs/${m.org.id}`} className="font-medium text-[var(--text)] hover:underline">
                        {m.org.name}
                      </Link>
                      <p className="text-xs text-[var(--text-subtle)]">{m.org.slug}</p>
                    </TD>
                    <TD>
                      <Badge tone={m.role === "owner" ? "neutral" : "neutral"} className="capitalize">
                        {m.role}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone="success">
                        {m.org.subscription?.plan.name ?? "Free"}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={m.status === "active" ? "success" : "danger"}>
                        {m.status}
                      </Badge>
                    </TD>
                  </TR>
                ))}
                {user.memberships.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="py-6 text-center text-sm text-[var(--text-subtle)]">
                      Not a member of any organizations.
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        {/* Workspaces Assignment */}
        <Card>
          <CardHeader>
            <CardTitle>Assigned Workspaces ({user.workspaceMembers.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Workspace</TH>
                  <TH>Role</TH>
                  <TH>Joined</TH>
                </TR>
              </THead>
              <tbody>
                {user.workspaceMembers.map((wm) => (
                  <TR key={wm.id}>
                    <TD className="font-medium text-[var(--text)]">
                      {wm.workspace.name}
                    </TD>
                    <TD className="capitalize text-[var(--text-muted)]">{wm.role}</TD>
                    <TD className="text-xs text-[var(--text-subtle)]">{formatDate(wm.createdAt)}</TD>
                  </TR>
                ))}
                {user.workspaceMembers.length === 0 && (
                  <TR>
                    <TD colSpan={3} className="py-6 text-center text-sm text-[var(--text-subtle)]">
                      No workspace assignments found.
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Auth Providers & Devices */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Connected OAuth Accounts */}
        <Card>
          <CardHeader>
            <CardTitle>Connected OAuth Accounts ({user.accounts.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Provider</TH>
                  <TH>Provider Account ID</TH>
                  <TH>Type</TH>
                </TR>
              </THead>
              <tbody>
                {user.accounts.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-medium capitalize text-[var(--text)]">{a.provider}</TD>
                    <TD className="font-mono text-xs text-[var(--text-muted)] truncate max-w-[180px]">{a.providerAccountId}</TD>
                    <TD className="text-xs text-[var(--text-subtle)] uppercase">{a.type}</TD>
                  </TR>
                ))}
                {user.accounts.length === 0 && (
                  <TR>
                    <TD colSpan={3} className="py-6 text-center text-sm text-[var(--text-subtle)]">
                      Standard email/password credential account.
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        {/* Devices and Sessions */}
        <Card>
          <CardHeader>
            <CardTitle>Registered Devices & Sessions ({user.devices.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Device</TH>
                  <TH>IP / Location</TH>
                  <TH>Last Active</TH>
                  <TH>Action</TH>
                </TR>
              </THead>
              <tbody>
                {user.devices.map((d) => (
                  <TR key={d.id}>
                    <TD>
                      <p className="font-medium text-xs text-[var(--text)]">{d.label || "Browser Session"}</p>
                      <p className="text-[11px] text-[var(--text-subtle)] truncate max-w-[200px]">{d.userAgent}</p>
                    </TD>
                    <TD className="font-mono text-xs text-[var(--text-muted)]">{d.ip || "Unknown"}</TD>
                    <TD className="text-xs text-[var(--text-subtle)]">
                      {relativeTime(d.lastSeenAt)}
                      {d.revokedAt && <Badge tone="danger" className="ml-1 text-[10px]">revoked</Badge>}
                    </TD>
                    <TD>
                      {!d.revokedAt ? (
                        <RevokeDeviceButton userId={user.id} deviceId={d.id} />
                      ) : (
                        <span className="text-xs text-[var(--text-subtle)]">Revoked</span>
                      )}
                    </TD>
                  </TR>
                ))}
                {user.devices.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="py-6 text-center text-sm text-[var(--text-subtle)]">
                      No registered devices on record.
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Recent Posts Authored */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Posts Authored ({user.posts.length} of {user._count.posts})</CardTitle>
            <Link href={`/admin/posts?q=${encodeURIComponent(user.email)}`} className="text-xs text-[var(--primary)] hover:underline">
              View all posts →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Content Snippet</TH>
                <TH>Workspace</TH>
                <TH>Platforms</TH>
                <TH>Status</TH>
                <TH>Scheduled / Created</TH>
              </TR>
            </THead>
            <tbody>
              {user.posts.map((p) => (
                <TR key={p.id}>
                  <TD className="max-w-[320px]">
                    <p className="text-sm font-medium text-[var(--text)] truncate">
                      {p.title || p.channels[0]?.body || "Untitled Post"}
                    </p>
                    <p className="text-[11px] font-mono text-[var(--text-subtle)]">{p.id}</p>
                  </TD>
                  <TD className="text-xs text-[var(--text-muted)]">{p.workspace.name}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {p.channels.map((c, i) => (
                        <Badge key={i} tone="neutral" className="text-[10px] capitalize">
                          {c.platform}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        p.status === "published"
                          ? "success"
                          : p.status === "failed"
                          ? "danger"
                          : p.status === "scheduled"
                          ? "info"
                          : "neutral"
                      }
                      className="capitalize"
                    >
                      {p.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-[var(--text-subtle)]">
                    {p.scheduledAt ? formatDate(p.scheduledAt) : formatDate(p.createdAt)}
                  </TD>
                </TR>
              ))}
              {user.posts.length === 0 && (
                <TR>
                  <TD colSpan={5} className="py-6 text-center text-sm text-[var(--text-subtle)]">
                    No posts authored yet.
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {/* Security & Activity Audit Trail */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>User Audit Trail ({auditLogs.length} events)</CardTitle>
            <Link href={`/admin/audit?q=${encodeURIComponent(user.id)}`} className="text-xs text-[var(--primary)] hover:underline">
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
                <TH>Target Type</TH>
                <TH>Target ID</TH>
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
                  <TD className="text-xs text-[var(--text-muted)] capitalize">{log.targetType}</TD>
                  <TD className="font-mono text-xs text-[var(--text-subtle)]">{log.targetId || "—"}</TD>
                  <TD className="text-xs font-mono text-[var(--text-muted)] truncate max-w-[280px]">
                    {log.metadata ? JSON.stringify(log.metadata) : "—"}
                  </TD>
                </TR>
              ))}
              {auditLogs.length === 0 && (
                <TR>
                  <TD colSpan={5} className="py-6 text-center text-sm text-[var(--text-subtle)]">
                    No audit records logged for this user.
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
