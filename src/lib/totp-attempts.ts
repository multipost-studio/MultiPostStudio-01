import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";

/**
 * Per-account TOTP brute-force guard. The 6-digit space with a ±1-step
 * window is only 3M possibilities — IP rate limits alone don't stop a
 * distributed attack, so failures are counted on the account row itself:
 * 5 failures → 15-minute lockout. Checked at login (auth.ts authorize)
 * and at setup-confirm/disable (actions/auth.ts).
 */

export const TOTP_MAX_ATTEMPTS = 5;
export const TOTP_LOCKOUT_MS = 15 * 60_000;

export async function totpLockedUntil(userId: string): Promise<Date | null> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorLockedUntil: true },
  });
  const until = row?.twoFactorLockedUntil ?? null;
  if (until && until.getTime() > Date.now()) return until;
  return null;
}

export async function recordTotpFailure(userId: string): Promise<void> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorFailedAttempts: true },
  });
  const attempts = (row?.twoFactorFailedAttempts ?? 0) + 1;
  await db.user.update({
    where: { id: userId },
    data: {
      twoFactorFailedAttempts: attempts,
      ...(attempts >= TOTP_MAX_ATTEMPTS
        ? { twoFactorLockedUntil: new Date(Date.now() + TOTP_LOCKOUT_MS) }
        : {}),
    },
  });
  if (attempts >= TOTP_MAX_ATTEMPTS) {
    await logAudit({
      actorId: userId,
      action: "auth.2fa_locked",
      targetType: "user",
      targetId: userId,
    }).catch(() => {});
  }
}

export async function resetTotpFailures(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { twoFactorFailedAttempts: 0, twoFactorLockedUntil: null },
  }).catch(() => {});
}
