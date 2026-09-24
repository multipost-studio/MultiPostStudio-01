"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { AuthError } from "next-auth";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/adapters/email";
import { flags, isProduction } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enforceRateLimit, RateLimitError, clientIp } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { safeNextPath } from "@/lib/utils";
import { attributeReferral, convertReferral } from "@/lib/referrals";
import { generateTotpSecret, verifyTotpCode, totpUri, sealTotpSecret, openTotpSecret } from "@/lib/totp";
import { recordTotpFailure, resetTotpFailures, totpLockedUntil } from "@/lib/totp-attempts";
import QRCode from "qrcode";

export type FormState = { ok: boolean; error?: string; message?: string; token?: string };

/** Only surface raw tokens in the UI in non-production without email wired up. */
const devToken = (t: string) => (!isProduction && !flags.realEmail ? t : undefined);

/** Run an auth action behind a per-IP rate limit; convert a hit to FormState. */
async function guarded(
  bucket: string,
  limit: number,
  windowMs: number,
  run: () => Promise<FormState>,
): Promise<FormState> {
  try {
    await enforceRateLimit(`${bucket}:${await clientIp()}`, limit, windowMs);
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: e.message };
    throw e;
  }
  return run();
}

const signUpSchema = z.object({
  name: z.string().min(2, "Enter your name").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").max(200),
});

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return guarded("signup", 5, 3_600_000, () => signUpImpl(formData));
}

async function signUpImpl(formData: FormData): Promise<FormState> {
  const { verifyTurnstile, turnstileFrom } = await import("@/lib/bot-protection");
  const bot = await verifyTurnstile(turnstileFrom(formData));
  if (!bot.ok) return { ok: false, error: "Bot check failed — please try again." };
  if (!(await getSettings()).signupEnabled) {
    return { ok: false, error: "Sign-ups are currently closed. Please check back later." };
  }
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, email, password } = parsed.data;

  // Deliberately reveals existence here (unlike password-reset, which doesn't)
  // — a signup form needs to tell a real user "you already have an account,
  // log in instead" rather than silently going nowhere. Rate-limited to 5/hr/IP
  // (see signUpAction's `guarded` call) so this isn't a practical email-
  // enumeration oracle; that's the actual mitigation, not message wording.
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "An account with that email already exists" };

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      notificationPref: { create: {} },
    },
  });

  // Referral attribution (no-op if disabled / bad code / self-referral).
  const ref = String(formData.get("ref") ?? "").trim();
  if (ref) await attributeReferral(ref, user.id, email).catch((e) => logger.warn({ err: e }, "referral attribution failed"));

  // Email verification token — emailed when a provider is configured.
  const token = randomBytes(24).toString("hex");
  await db.verificationToken.create({
    data: { identifier: email, token, purpose: "email_verify", expires: new Date(Date.now() + 86_400_000) },
  });
  sendVerificationEmail(email, token, name).catch((e) =>
    logger.error({ err: e, email }, "verification email failed"),
  );

  await logAudit({ actorId: user.id, action: "auth.signup", targetType: "user", targetId: user.id });

  // signIn throws its own redirect after writing the session cookie — let it.
  try {
    await signIn("credentials", { email, password, redirectTo: "/onboarding" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Account created but sign-in failed. Try logging in." };
    }
    throw err;
  }
  return { ok: true };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  code: z.string().max(10).optional(),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return guarded("login", 10, 300_000, () => loginImpl(formData));
}

async function loginImpl(formData: FormData): Promise<FormState> {
  const { verifyTurnstile, turnstileFrom } = await import("@/lib/bot-protection");
  const bot = await verifyTurnstile(turnstileFrom(formData));
  if (!bot.ok) return { ok: false, error: "Bot check failed — please try again." };
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: formData.get("password"),
    code: formData.get("code") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Enter your email and password" };

  const nextRaw = String(formData.get("next") ?? "/dashboard");
  // safeNextPath, not startsWith("/"): protocol-relative //evil.com passes
  // a naive check and browsers treat it as absolute (open redirect).
  const next = safeNextPath(nextRaw);

  // signIn throws its own redirect after writing the session cookie — let it.
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: next });
  } catch (err) {
    if (err instanceof AuthError) {
      // Deliberately the same message whether the password or the 2FA code
      // was wrong — distinguishing them would tell an attacker which account
      // has 2FA enabled.
      return { ok: false, error: "Incorrect email or password" };
    }
    throw err;
  }
  return { ok: true };
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/** Kick off Google OAuth. Form action on the "Continue with Google" button. */
export async function googleSignInAction(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? "/dashboard"));
  // signIn throws its own redirect to Google — let it propagate.
  await signIn("google", { redirectTo: next });
}

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return guarded("pwreset-req", 5, 3_600_000, () => requestPasswordResetImpl(formData));
}

async function requestPasswordResetImpl(formData: FormData): Promise<FormState> {
  const { verifyTurnstile, turnstileFrom } = await import("@/lib/bot-protection");
  const bot = await verifyTurnstile(turnstileFrom(formData));
  if (!bot.ok) return { ok: false, error: "Bot check failed — please try again." };
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: "Enter a valid email" };

  const user = await db.user.findUnique({ where: { email } });
  // Always respond success (no account enumeration).
  if (!user) return { ok: true, message: "If that email exists, a reset link is on its way." };

  const token = randomBytes(24).toString("hex");
  await db.verificationToken.create({
    data: { identifier: email, token, purpose: "password_reset", expires: new Date(Date.now() + 3_600_000) },
  });
  sendPasswordResetEmail(email, token).catch((e) =>
    logger.error({ err: e, email }, "reset email failed"),
  );
  return {
    ok: true,
    message: flags.realEmail
      ? "If that email exists, a reset link is on its way."
      : "Reset link generated (email provider not configured — use the token below).",
    token: devToken(token),
  };
}

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "At least 8 characters"),
});

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return guarded("pwreset", 10, 3_600_000, () => resetPasswordImpl(formData));
}

async function resetPasswordImpl(formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const row = await db.verificationToken.findUnique({ where: { token: parsed.data.token } });
  if (!row || row.purpose !== "password_reset" || row.expires < new Date()) {
    return { ok: false, error: "This reset link is invalid or expired" };
  }
  const user = await db.user.findUnique({ where: { email: row.identifier } });
  if (!user) return { ok: false, error: "Account not found" };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  });
  // Invalidate any existing active sessions so a stolen session token cannot
  // persist after a legitimate password reset.
  await db.device.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await db.verificationToken.deleteMany({ where: { identifier: row.identifier, purpose: "password_reset" } });
  await logAudit({ actorId: user.id, action: "auth.password_reset", targetType: "user", targetId: user.id });

  return { ok: true, message: "Password updated. You can sign in now." };
}

export async function verifyEmailAction(token: string): Promise<FormState> {
  try {
    // 20 verifications/hour/IP — token guessing is the threat; tokens are
    // 48 hex chars so this is defense-in-depth, not the primary guard.
    await enforceRateLimit(`verify:${await clientIp()}`, 20, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: e.message };
    throw e;
  }
  if (typeof token !== "string" || token.length > 200) {
    return { ok: false, error: "Verification link is invalid or expired" };
  }
  const row = await db.verificationToken.findUnique({ where: { token } });
  if (!row || row.purpose !== "email_verify" || row.expires < new Date()) {
    return { ok: false, error: "Verification link is invalid or expired" };
  }
  const verified = await db.user.update({ where: { email: row.identifier }, data: { emailVerified: new Date() } });
  await db.verificationToken.deleteMany({ where: { identifier: row.identifier, purpose: "email_verify" } });

  if ((await getSettings()).referralTrigger === "email_verified") {
    await convertReferral(verified.id).catch((e) => logger.warn({ err: e }, "referral convert on verify failed"));
  }
  return { ok: true, message: "Email verified" };
}

export async function resendVerificationAction(): Promise<FormState> {
  const user = await requireUser();
  try {
    // 5 resends/hour/user — each resend is an email send (cost + spam vector).
    await enforceRateLimit(`resend-verify:${user.id}`, 5, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: e.message };
    throw e;
  }
  if (user.emailVerified) return { ok: true, message: "Already verified" };
  const token = randomBytes(24).toString("hex");
  await db.verificationToken.create({
    data: { identifier: user.email, token, purpose: "email_verify", expires: new Date(Date.now() + 86_400_000) },
  });
  sendVerificationEmail(user.email, token).catch((e) =>
    logger.error({ err: e }, "resend verification email failed"),
  );
  return {
    ok: true,
    message: flags.realEmail ? "Verification email sent" : "Verification link generated",
    token: devToken(token),
  };
}

/**
 * Re-authenticate for sensitive security changes. Password users prove the
 * password; Google-only users (no passwordHash) prove the current TOTP code
 * when 2FA is already on. A bare session is not enough — session theft
 * must not be able to strip or re-enroll 2FA unchallenged.
 */
async function reauthFor2faChange(
  userId: string,
  input: { password?: string; code?: string },
  opts: { requireCode: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true },
  });
  if (!row) return { ok: false, error: "Account not found" };
  if (row.passwordHash) {
    if (!input.password || !(await bcrypt.compare(input.password, row.passwordHash))) {
      return { ok: false, error: "Incorrect password" };
    }
  }
  if (opts.requireCode || !row.passwordHash) {
    if (!row.twoFactorEnabled) {
      if (!row.passwordHash) return { ok: false, error: "Set a password first" };
    } else {
      const secret = openTotpSecret(row.twoFactorSecret);
      if (await totpLockedUntil(userId)) return { ok: false, error: "Too many attempts — try again later" };
      if (!secret || !verifyTotpCode(secret, input.code ?? "")) {
        await recordTotpFailure(userId);
        return { ok: false, error: "Incorrect authenticator code" };
      }
      await resetTotpFailures(userId);
    }
  }
  return { ok: true };
}

/**
 * Real TOTP 2FA (RFC 6238) — three-step flow:
 *   1. startTwoFactorSetupAction: re-auth, generate a sealed secret, store it
 *      (NOT enabled yet — a half-finished setup must never grant a false
 *      sense of protection), hand back the QR code + manual-entry secret.
 *   2. confirmTwoFactorSetupAction: user scans it with their authenticator app
 *      and enters the code it shows; only once that's verified does it flip on.
 *   3. disableTwoFactorAction: password + current code required, turns it off.
 * auth.ts's authorize() enforces this same secret at every login.
 */
export async function startTwoFactorSetupAction(
  input?: { password?: string },
): Promise<{ ok: true; secret: string; otpauthUri: string; qrDataUrl: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const gate = await reauthFor2faChange(user.id, { password: input?.password }, { requireCode: false });
  if (!gate.ok) return gate;
  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: sealTotpSecret(secret), twoFactorEnabled: false },
  });
  const otpauthUri = totpUri(secret, user.email);
  try {
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });
    return { ok: true, secret, otpauthUri, qrDataUrl };
  } catch (e) {
    logger.error({ err: e }, "2fa qr generation failed");
    return { ok: false, error: "Couldn't generate the QR code — try again" };
  }
}

export async function confirmTwoFactorSetupAction(code: string): Promise<FormState> {
  const user = await requireUser();
  if (await totpLockedUntil(user.id)) return { ok: false, error: "Too many attempts — try again later" };
  const row = await db.user.findUnique({ where: { id: user.id }, select: { twoFactorSecret: true } });
  const secret = openTotpSecret(row?.twoFactorSecret);
  if (!secret) return { ok: false, error: "Start setup again — no pending secret found" };
  if (!verifyTotpCode(secret, code)) {
    await recordTotpFailure(user.id);
    return { ok: false, error: "Invalid code — check your authenticator app and try again" };
  }
  await resetTotpFailures(user.id);
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
  await logAudit({ actorId: user.id, action: "auth.2fa_enabled", targetType: "user", targetId: user.id });
  return { ok: true, message: "Two-factor authentication enabled" };
}

export async function disableTwoFactorAction(input?: { password?: string; code?: string }): Promise<FormState> {
  const user = await requireUser();
  const gate = await reauthFor2faChange(
    user.id,
    { password: input?.password, code: input?.code },
    { requireCode: true },
  );
  if (!gate.ok) return gate;
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  await resetTotpFailures(user.id);
  await logAudit({ actorId: user.id, action: "auth.2fa_disabled", targetType: "user", targetId: user.id });
  return { ok: true, message: "Two-factor authentication disabled" };
}

export async function revokeDeviceAction(deviceId: string): Promise<FormState> {
  const user = await requireUser();
  const device = await db.device.findUnique({ where: { id: deviceId } });
  if (!device || device.userId !== user.id) return { ok: false, error: "Device not found" };
  await db.device.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
  return { ok: true, message: "Device signed out" };
}
