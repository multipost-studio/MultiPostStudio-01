"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { confirmDestructive } from "@/components/ui/confirm";
import {
  unlockUserTotpAction,
  clearAllTotpLockoutsAction,
  revokeUserDeviceAction,
} from "@/app/actions/admin";

export function SecurityBulkActions({
  hasLockedAccounts,
}: {
  hasLockedAccounts: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  const handleClearAll = async () => {
    if (
      !(await confirmDestructive({
        title: "Clear All Lockouts",
        body: "Reset TOTP failed attempts and lockout timers for all currently locked accounts across the platform?",
        confirmLabel: "Clear All",
      }))
    ) {
      return;
    }
    setLoading(true);
    const res = await clearAllTotpLockoutsAction();
    setLoading(false);
    toast({
      title: res.ok ? res.message ?? "Lockouts cleared" : "Failed to clear lockouts",
      tone: res.ok ? "success" : "error",
    });
    if (res.ok) router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      {hasLockedAccounts && (
        <Button size="sm" variant="secondary" loading={loading} onClick={handleClearAll}>
          Clear All Lockouts
        </Button>
      )}
    </div>
  );
}

export function SecurityRowActions({
  userId,
  twoFactorEnabled,
  isLocked,
}: {
  userId: string;
  twoFactorEnabled: boolean;
  isLocked: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const handleUnlock = async () => {
    setBusy("unlock");
    const res = await unlockUserTotpAction(userId, false);
    setBusy(null);
    toast({
      title: res.ok ? res.message ?? "Unlocked" : "Failed",
      tone: res.ok ? "success" : "error",
    });
    if (res.ok) router.refresh();
  };

  const handleReset2FA = async () => {
    if (
      !(await confirmDestructive({
        title: "Reset 2FA",
        body: "Disable 2FA and clear secret key for this user? They will be able to log in with just their password.",
        confirmLabel: "Reset 2FA",
      }))
    ) {
      return;
    }
    setBusy("reset");
    const res = await unlockUserTotpAction(userId, true);
    setBusy(null);
    toast({
      title: res.ok ? res.message ?? "2FA reset" : "Failed",
      tone: res.ok ? "success" : "error",
    });
    if (res.ok) router.refresh();
  };

  return (
    <div className="flex items-center gap-1.5">
      {isLocked && (
        <Button size="sm" variant="secondary" loading={busy === "unlock"} onClick={handleUnlock}>
          Clear Lockout
        </Button>
      )}
      {twoFactorEnabled && (
        <Button size="sm" variant="ghost" loading={busy === "reset"} onClick={handleReset2FA}>
          Reset 2FA
        </Button>
      )}
    </div>
  );
}
