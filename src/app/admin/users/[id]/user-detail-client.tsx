"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { confirmDestructive } from "@/components/ui/confirm";
import {
  setUserAdminAction,
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
            run(
              "sus",
              () => setUserSuspendedAction(user.id, !user.suspendedAt),
              user.suspendedAt ? undefined : `Suspend ${user.name}? Their active sessions will be terminated.`
            )
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
          onClick={() => run("ver", () => forceVerifyUserAction(user.id))}
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
            run(
              "unlock",
              () => unlockUserTotpAction(user.id, false),
              "Clear TOTP lockout attempts for this user?"
            )
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
            run(
              "reset2fa",
              () => unlockUserTotpAction(user.id, true),
              "Disable 2FA for this user? Use only if the user lost their authenticator device."
            )
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
          run(
            "adm",
            () => setUserAdminAction(user.id, !user.isPlatformAdmin),
            user.isPlatformAdmin
              ? `Remove platform admin privileges from ${user.name}?`
              : `Promote ${user.name} to Platform Admin? They will have full system access.`
          )
        }
      >
        {user.isPlatformAdmin ? "Revoke Admin" : "Make Admin"}
      </Button>

      {user.deletedAt ? (
        <Button
          size="sm"
          variant="outline"
          loading={busy === "restore"}
          onClick={() => run("restore", () => restoreUserAction(user.id))}
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
            run(
              "del",
              () => deleteUserAction(user.id),
              `Soft-delete user ${user.name}? Their sessions will be killed and they will no longer be able to log in.`
            )
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
    if (
      !(await confirmDestructive({
        title: "Revoke Session",
        body: "Revoke this device session immediately?",
        confirmLabel: "Revoke",
      }))
    ) {
      return;
    }
    setLoading(true);
    const res = await revokeUserDeviceAction(userId, deviceId);
    setLoading(false);
    toast({
      title: res.ok ? res.message : "Failed to revoke device",
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
