"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/adapters/email";
import { flags } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { attributeReferral, convertReferral } from "@/lib/referrals";

export type FormState = { ok: boolean; error?: string; message?: string; token?: string };

/** Only surface raw tokens in the UI when real email isn't wired up. */
const devToken = (t: string) => (flags.realEmail ? undefined : t);

/** Best-effort client IP for rate-limit keying (falls back to a shared bucket). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

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
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return guarded("login", 10, 300_000, () => loginImpl(formData));
}

async function loginImpl(formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: "Enter your email and password" };

  const nextRaw = String(formData.get("next") ?? "/dashboard");
  const next = nextRaw.startsWith("/") ? nextRaw : "/dashboard";

  // signIn throws its own redirect after writing the session cookie — let it.
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: next });
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Incorrect email or password" };
    }
    throw err;
  }
  return { ok: true };
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return guarded("pwreset-req", 5, 3_600_000, () => requestPasswordResetImpl(formData));
}

async function requestPasswordResetImpl(formData: FormData): Promise<FormState> {
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
  await db.verificationToken.deleteMany({ where: { identifier: row.identifier, purpose: "password_reset" } });
  await logAudit({ actorId: user.id, action: "auth.password_reset", targetType: "user", targetId: user.id });

  return { ok: true, message: "Password updated. You can sign in now." };
}

export async function verifyEmailAction(token: string): Promise<FormState> {
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

/** Stub 2FA — generates a secret; verification accepts code 123456 for demo. */
export async function toggle2FAAction(enable: boolean, code?: string): Promise<FormState> {
  const user = await requireUser();
  if (enable) {
    if (code !== "123456") return { ok: false, error: "Invalid code. For this demo, use 123456." };
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorSecret: randomBytes(10).toString("hex") },
    });
    await logAudit({ actorId: user.id, action: "auth.2fa_enabled", targetType: "user", targetId: user.id });
    return { ok: true, message: "Two-factor authentication enabled" };
  }
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
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
