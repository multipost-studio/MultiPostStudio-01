import { createNotification } from "./service";

/**
 * Security notifications, limited to events the app detects with certainty because it performs them itself:
 * a password change or reset, and two-factor being turned on or off. (There is no device-fingerprint or
 * geo-IP "new login" detection here, so none is claimed.) They are required types: they cannot be switched
 * off, and they are mirrored to email so a stolen session cannot hide them.
 */
export type SecurityEvent = "password_changed" | "password_reset" | "two_factor_enabled" | "two_factor_disabled";

const COPY: Record<SecurityEvent, { type: "security_password_changed" | "security_two_factor"; title: string; body: string }> = {
  password_changed: {
    type: "security_password_changed",
    title: "Your password was changed",
    body: "You changed your password and were signed out everywhere. If this wasn't you, reset your password straight away and contact support.",
  },
  password_reset: {
    type: "security_password_changed",
    title: "Your password was reset",
    body: "Your password was reset with an email link and other sessions were signed out. If this wasn't you, reset it again and contact support.",
  },
  two_factor_enabled: {
    type: "security_two_factor",
    title: "Two-factor sign-in turned on",
    body: "Sign-ins now ask for a code from your authenticator app.",
  },
  two_factor_disabled: {
    type: "security_two_factor",
    title: "Two-factor sign-in turned off",
    body: "Your account is now protected by your password alone. If this wasn't you, change your password and contact support.",
  },
};

export async function notifySecurityEvent(userId: string, event: SecurityEvent, at = new Date()): Promise<void> {
  const c = COPY[event];
  await createNotification({
    userId,
    type: c.type,
    title: c.title,
    body: c.body,
    linkUrl: "/settings/security",
    actionLabel: "Review security",
    entityType: "user",
    entityId: userId,
    // A double-submitted form must not announce the same change twice.
    dedupeKey: `security:${event}:${userId}:${at.toISOString().slice(0, 16)}`,
  });
}
