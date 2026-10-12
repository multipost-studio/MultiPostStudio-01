"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { confirmDestructive, promptReason } from "@/components/ui/confirm";
import {
  setUserAdminAction,
  setUserPlatformRoleAction,
  setUserSuspendedAction,
  forceVerifyUserAction,
  deleteUserAction,
  restoreUserAction,
  unlockUserTotpAction,
  revokeUserDeviceAction,
} from "@/app/actions/admin";
import { impersonateUserAction } from "@/app/actions/impersonation";

type Res = { ok: boolean; error?: string; message?: string; redirectTo?: string };

export function UserDetailHeaderActions({
  user,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    isPlatformAdmin: boolean;
    platformRole: string | null;
    suspendedAt: string | null;
    deletedAt: string | null;
    emailVerified: string | null;
    twoFactorEnabled: boolean;
    isLocked: boolean;
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<Res>, confirmMsg?: string) => {
    if (
      confirmMsg &&
      !(await confirmDestructive({
        title: "Please confirm",
        body: confirmMsg,
        confirmLabel: "Confirm",
      }))
    ) {
      return;
    }
    setBusy(key);
    try {
      const res = await fn();
      toast({
        title: res.ok ? res.message ?? "Done" : res.error ?? "Failed",
        tone: res.ok ? "success" : "error",
      });
      if (res.ok) {
        if (res.redirectTo) {
          window.location.href = res.redirectTo;
        } else {
          router.refresh();
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "An unexpected error occurred";
      toast({ title: msg, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  /** Ask for a written reason first (recorded in the audit log), then run. Nothing happens if the person cancels. */
  const runWithReason = async (key: string, fn: (reason: string) => Promise<Res>, body: string | undefined, title = "Please confirm") => {
    const reason = await promptReason({ title, body: body ?? "Confirm this change. Your reason is saved in the audit log.", confirmLabel: "Confirm" });
    if (reason) await run(key, () => fn(reason));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!user.isPlatformAdmin && !user.suspendedAt && !user.deletedAt && (
        <Button
          size="sm"
          variant="outline"
          loading={busy === "imp"}
          onClick={() =>
            run(
              "imp",
              () => impersonateUserAction(user.id),
              `Impersonate ${user.name} (${user.email})? You will navigate the application from their perspective until you exit.`
            )
          }
        >
          Impersonate User
        </Button>
      )}

      {!user.deletedAt && (
        <Button
          size="sm"
          variant={user.suspendedAt ? "secondary" : "ghost"}
          loading={busy === "sus"}
          onClick={() =>
            runWithReason("sus", (r) => setUserSuspendedAction(user.id, !user.suspendedAt, r), user.suspendedAt ? undefined : `Suspend ${user.name}? Their active sessions will be terminated.`)
          }
        >
          {user.suspendedAt ? "Restore Account" : "Suspend Account"}
        </Button>
      )}

      {!user.emailVerified && !user.deletedAt && (
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "ver"}
          onClick={() => runWithReason("ver", (r) => forceVerifyUserAction(user.id, r), "Confirm this change. Your reason is saved in the audit log.")}
        >
          Force Verify Email
        </Button>
      )}

      {user.isLocked && (
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "unlock"}
          onClick={() =>
            runWithReason("unlock", (r) => unlockUserTotpAction(user.id, false, r), "Clear TOTP lockout attempts for this user?")
          }
        >
          Clear Lockout
        </Button>
      )}

      {user.twoFactorEnabled && (
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "reset2fa"}
          onClick={() =>
            runWithReason("reset2fa", (r) => unlockUserTotpAction(user.id, true, r), "Disable 2FA for this user? Use only if the user lost their authenticator device.")
          }
        >
          Reset 2FA
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        loading={busy === "adm"}
        onClick={() =>
          runWithReason(
            "adm",
            (r) => setUserAdminAction(user.id, !user.isPlatformAdmin, r),
            user.isPlatformAdmin
              ? `Remove platform admin privileges from ${user.name}?`
              : `Promote ${user.name} to Platform Admin? They will have full system access.`
          )
        }
      >
        {user.isPlatformAdmin ? "Revoke Admin" : "Make Admin"}
      </Button>

      {user.isPlatformAdmin && (
        <Button
          size="sm"
          variant="outline"
          loading={busy === "tier"}
          onClick={() =>
            runWithReason(
              "tier",
              (r) => setUserPlatformRoleAction(user.id, user.platformRole === "support" ? null : "support", r),
              user.platformRole === "support"
                ? `Restore ${user.name} to full platform admin access?`
                : `Restrict ${user.name} to the Support tier? They'll only be able to access /admin/support — every other admin page redirects them there.`
            )
          }
        >
          {user.platformRole === "support" ? "Restore Full Admin" : "Restrict to Support"}
        </Button>
      )}

      {user.deletedAt ? (
        <Button
          size="sm"
          variant="outline"
          loading={busy === "restore"}
          onClick={() => runWithReason("restore", (r) => restoreUserAction(user.id, r), "Confirm this change. Your reason is saved in the audit log.")}
        >
          Undelete User
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-[var(--danger)] hover:bg-[var(--danger)]/10"
          loading={busy === "del"}
          onClick={() =>
            runWithReason("del", (r) => deleteUserAction(user.id, r), `Soft-delete user ${user.name}? Their sessions will be killed and they will no longer be able to log in.`)
          }
        >
          Delete User
        </Button>
      )}
    </div>
  );
}

export function RevokeDeviceButton({ userId, deviceId }: { userId: string; deviceId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  const handleRevoke = async () => {
    const reason = await promptReason({ title: "Revoke Session", body: "Revoke this device session immediately?", confirmLabel: "Revoke" });
    if (!reason) return;
    setLoading(true);
    const res = await revokeUserDeviceAction(userId, deviceId, reason);
    setLoading(false);
    toast({
      title: res.ok ? (res.message ?? "Session revoked") : (res.error ?? "Failed to revoke device"),
      tone: res.ok ? "success" : "error",
    });
    if (res.ok) router.refresh();
  };

  return (
    <Button size="sm" variant="ghost" className="text-xs text-[var(--danger)]" loading={loading} onClick={handleRevoke}>
      Revoke
    </Button>
  );
}
