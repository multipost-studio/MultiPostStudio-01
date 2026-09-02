"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { AuthError } from "next-auth";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/events";

export type FormState = { ok: boolean; error?: string; message?: string; token?: string };

const signUpSchema = z.object({
  name: z.string().min(2, "Enter your name").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").max(200),
});

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
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

  // Email verification token (surfaced in dev instead of emailed).
  const token = randomBytes(24).toString("hex");
  await db.verificationToken.create({
    data: { identifier: email, token, purpose: "email_verify", expires: new Date(Date.now() + 86_400_000) },
  });

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
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: "Enter a valid email" };

  const user = await db.user.findUnique({ where: { email } });
  // Always respond success (no account enumeration).
  if (!user) return { ok: true, message: "If that email exists, a reset link is on its way." };

  const token = randomBytes(24).toString("hex");
  await db.verificationToken.create({
    data: { identifier: email, token, purpose: "password_reset", expires: new Date(Date.now() + 3_600_000) },
  });
  // Dev: return token so the flow is testable without email.
  return {
    ok: true,
    message: "Reset link generated. In production this is emailed.",
    token,
  };
}

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "At least 8 characters"),
});

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
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
  await db.user.update({ where: { email: row.identifier }, data: { emailVerified: new Date() } });
  await db.verificationToken.deleteMany({ where: { identifier: row.identifier, purpose: "email_verify" } });
  return { ok: true, message: "Email verified" };
}

export async function resendVerificationAction(): Promise<FormState> {
  const user = await requireUser();
  if (user.emailVerified) return { ok: true, message: "Already verified" };
  const token = randomBytes(24).toString("hex");
  await db.verificationToken.create({
    data: { identifier: user.email, token, purpose: "email_verify", expires: new Date(Date.now() + 86_400_000) },
  });
  return { ok: true, message: "Verification link generated", token };
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
