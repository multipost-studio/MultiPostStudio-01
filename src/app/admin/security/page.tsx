import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate, relativeTime } from "@/lib/utils";
import { Stat, Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { SecurityBulkActions, SecurityRowActions } from "./security-client";

export const metadata: Metadata = { title: "Admin · Security & Lockouts" };

export default async function AdminSecurityPage() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    twoFactorUsers,
    lockedUsers,
    activeAdminUsers,
    activeDevicesCount,
    revokedDevicesCount,
    securityAuditLogs,
  ] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.user.count({ where: { twoFactorEnabled: true, deletedAt: null } }),
    db.user.findMany({
      where: {
        OR: [
          { twoFactorLockedUntil: { gt: now } },
          { twoFactorFailedAttempts: { gt: 0 } },
        ],
        deletedAt: null,
      },
      orderBy: { twoFactorFailedAttempts: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        twoFactorEnabled: true,
        twoFactorFailedAttempts: true,
        twoFactorLockedUntil: true,
        suspendedAt: true,
      },
    }),
    db.user.findMany({
      where: { isPlatformAdmin: true, deletedAt: null },
      include: {
        devices: { orderBy: { lastSeenAt: "desc" }, take: 1 },
        _count: { select: { sessions: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.device.count({
      where: { lastSeenAt: { gte: twentyFourHoursAgo }, revokedAt: null },
    }),
    db.device.count({
      where: { revokedAt: { gte: sevenDaysAgo } },
    }),
    db.auditLog.findMany({
      where: {
        action: {
          in: [
            "admin.user_totp_unlocked",
            "admin.user_totp_reset",
            "admin.all_totp_lockouts_cleared",
            "admin.impersonate_start",
            "admin.impersonate_stop",
            "admin.user_device_revoked",
            "admin.user_admin_changed",
            "admin.user_suspended",
            "admin.user_restored",
            "admin.user_deleted",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const twoFactorPct = totalUsers > 0 ? Math.round((twoFactorUsers / totalUsers) * 100) : 0;
  const activeLockouts = lockedUsers.filter(
    (u) => u.twoFactorLockedUntil && u.twoFactorLockedUntil > now
  ).length;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Security & Lockouts</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Monitor authentication threats, TOTP brute-force lockouts, platform administrators, and device security.
          </p>
        </div>
        <SecurityBulkActions hasLockedAccounts={lockedUsers.length > 0} />
      </div>

      {/* Metrics Row */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active Lockouts" value={activeLockouts} />
        <Stat label="At-Risk Attempts" value={lockedUsers.length} />
        <Stat label="2FA Adoption" value={`${twoFactorPct}%`} />
        <Stat label="Platform Admins" value={activeAdminUsers.length} />
        <Stat label="Active Devices (24h)" value={activeDevicesCount} />
        <Stat label="Revoked Devices (7d)" value={revokedDevicesCount} />
      </div>

      {/* Locked & At-Risk Accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Locked & At-Risk Accounts ({lockedUsers.length})</CardTitle>
            <span className="text-xs text-[var(--text-subtle)]">
              Brute-force protection limits failed TOTP entries to 5 attempts before a 15-minute lock.
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>User Account</TH>
                <TH>Failed Attempts</TH>
                <TH>Lockout Status</TH>
                <TH>2FA Status</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <tbody>
              {lockedUsers.map((u) => {
                const isLocked = !!(u.twoFactorLockedUntil && u.twoFactorLockedUntil > now);
                return (
                  <TR key={u.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} src={u.image} size={28} />
                        <div>
                          <Link href={`/admin/users/${u.id}`} className="font-medium text-sm text-[var(--text)] hover:underline">
                            {u.name}
                          </Link>
                          <p className="text-xs text-[var(--text-subtle)]">{u.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={u.twoFactorFailedAttempts >= 3 ? "danger" : "warning"}>
                        {u.twoFactorFailedAttempts} / 5 attempts
                      </Badge>
                    </TD>
                    <TD>
                      {isLocked ? (
                        <div className="space-y-0.5">
                          <Badge tone="danger">Locked</Badge>
                          <p className="text-[11px] text-[var(--text-subtle)]">
                            Expires {relativeTime(u.twoFactorLockedUntil!)}
                          </p>
                        </div>
                      ) : (
                        <Badge tone="neutral">Attempts logged</Badge>
                      )}
                    </TD>
                    <TD>
                      {u.twoFactorEnabled ? (
                        <Badge tone="success">2FA Enabled</Badge>
                      ) : (
                        <Badge tone="neutral">Disabled</Badge>
                      )}
                    </TD>
                    <TD>
                      <SecurityRowActions
                        userId={u.id}
                        twoFactorEnabled={u.twoFactorEnabled}
                        isLocked={isLocked || u.twoFactorFailedAttempts > 0}
                      />
                    </TD>
                  </TR>
                );
              })}
              {lockedUsers.length === 0 && (
                <TR>
                  <TD colSpan={5} className="py-8 text-center text-sm text-[var(--text-subtle)]">
                    ✓ All accounts healthy — zero active lockouts or failed attempt streaks.
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {/* Platform Administrators Audit */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Platform Administrators ({activeAdminUsers.length})</CardTitle>
            <span className="text-xs text-[var(--text-subtle)]">
              Accounts with unrestricted root access to the admin console.
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Administrator</TH>
                <TH>2FA Security</TH>
                <TH>Last Active Device</TH>
                <TH>Active Sessions</TH>
                <TH>Joined Date</TH>
              </TR>
            </THead>
            <tbody>
              {activeAdminUsers.map((a) => {
                const latestDevice = a.devices[0];
                return (
                  <TR key={a.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar name={a.name} src={a.image} size={28} />
                        <div>
                          <Link href={`/admin/users/${a.id}`} className="font-medium text-sm text-[var(--text)] hover:underline">
                            {a.name}
                          </Link>
                          <p className="text-xs text-[var(--text-subtle)]">{a.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {a.twoFactorEnabled ? (
                        <Badge tone="success">Protected (2FA)</Badge>
                      ) : (
                        <Badge tone="danger">2FA Not Enabled</Badge>
                      )}
                    </TD>
                    <TD>
                      {latestDevice ? (
                        <div>
                          <p className="text-xs font-medium text-[var(--text)] truncate max-w-[200px]">
                            {latestDevice.label || "Browser"}
                          </p>
                          <p className="text-[11px] font-mono text-[var(--text-subtle)]">
                            {latestDevice.ip} · {relativeTime(latestDevice.lastSeenAt)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-subtle)]">—</span>
                      )}
                    </TD>
                    <TD className="tabular-nums text-sm">{a._count.sessions}</TD>
                    <TD className="text-xs text-[var(--text-subtle)]">{formatDate(a.createdAt)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {/* Security Audit Events */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Security Events Stream ({securityAuditLogs.length} events)</CardTitle>
            <Link href="/admin/audit" className="text-xs text-[var(--primary)] hover:underline">
              View all audit logs →
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
                <TH>Target</TH>
                <TH>Details</TH>
              </TR>
            </THead>
            <tbody>
              {securityAuditLogs.map((log) => (
                <TR key={log.id}>
                  <TD className="text-xs text-[var(--text-subtle)] whitespace-nowrap">
                    {formatDate(log.createdAt)} ({relativeTime(log.createdAt)})
                  </TD>
                  <TD className="font-mono text-xs font-semibold text-[var(--text)]">{log.action}</TD>
                  <TD className="text-xs font-mono text-[var(--text-muted)]">
                    {log.actorId ? (
                      <Link href={`/admin/users/${log.actorId}`} className="hover:underline">
                        {log.actorId.slice(0, 10)}
                      </Link>
                    ) : (
                      "System"
                    )}
                  </TD>
                  <TD className="text-xs font-mono text-[var(--text-muted)]">
                    {log.targetId ? (
                      <Link href={`/admin/users/${log.targetId}`} className="hover:underline">
                        {log.targetType}:{log.targetId.slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-xs font-mono text-[var(--text-muted)] truncate max-w-[300px]">
                    {log.metadata ? JSON.stringify(log.metadata) : "—"}
                  </TD>
                </TR>
              ))}
              {securityAuditLogs.length === 0 && (
                <TR>
                  <TD colSpan={5} className="py-8 text-center text-sm text-[var(--text-subtle)]">
                    No recent security events logged.
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
