import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { verifyTotpCode, openTotpSecret } from "@/lib/totp";
import { recordTotpFailure, resetTotpFailures, totpLockedUntil } from "@/lib/totp-attempts";
import { registerDevice, deviceSessionValid } from "@/lib/device-session";
import { rateLimit } from "@/lib/rate-limit";

const googleEnabled = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        domain:
          process.env.AUTH_COOKIE_DOMAIN ||
          (process.env.NODE_ENV === "production" && (process.env.APP_URL ?? "").includes("multipoststudio.online")
            ? ".multipoststudio.online"
            : undefined),
      },
    },
  },
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "2FA code", type: "text" },
      },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
        // Direct NextAuth throttle: loginAction's 10/5m/IP lives in the server
        // action, so a POST straight to /api/auth/callback/credentials bypassed
        // it. Enforce a per-email bucket here too (survives IP rotation) plus
        // a best-effort per-IP bucket when headers are available. Uniform null
        // on hit — indistinguishable from bad credentials.
        try {
          const emailHit = await rateLimit(`login-direct:${email}`, 10, 5 * 60_000);
          if (!emailHit.ok) return null;
          try {
            const { headers } = await import("next/headers");
            const h = await headers();
            const ip =
              h.get("x-real-ip") ??
              h.get("x-forwarded-for")?.split(",").pop()?.trim() ??
              "unknown";
            const ipHit = await rateLimit(`login-direct-ip:${ip}`, 30, 5 * 60_000);
            if (!ipHit.ok) return null;
          } catch {
            // headers() unavailable (e.g. unit tests calling authorize
            // directly) — email bucket above is the primary guard.
          }
        } catch {
          // Limiter failure must never block login outright (fail-open);
          // the action-level throttle + TOTP lockout remain.
        }
        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash || user.deletedAt || user.suspendedAt) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        // Real TOTP (RFC 6238) — see src/lib/totp.ts. `twoFactorSecret` is
        // only set once setup has been confirmed (startTwoFactorSetupAction /
        // confirmTwoFactorSetupAction in actions/auth.ts), so an unset secret
        // here would mean twoFactorEnabled is true with no way to satisfy it —
        // treat that as a hard lockout rather than silently skipping the check.
        if (user.twoFactorEnabled) {
          const secret = openTotpSecret(user.twoFactorSecret);
          const locked = await totpLockedUntil(user.id);
          // Uniform null: locked-out, missing-secret, and wrong-code all
          // look identical to the caller (see the uniform message in
          // loginAction). Failures still count — including while locked, so
          // an attacker can't probe for the lockout to lift.
          if (!secret || locked || !verifyTotpCode(secret, String(creds?.code ?? ""))) {
            await recordTotpFailure(user.id);
            return null;
          }
          await resetTotpFailures(user.id);
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? undefined,
        };
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            // false (the safe default) — "dangerous" linking merges a Google
            // sign-in into whatever existing user row already has that email,
            // with no proof the person signing up with credentials owned that
            // inbox. Since signup here doesn't require verifying email before
            // first login, `true` let an attacker pre-register a victim's
            // email/password and inherit the account for good the moment the
            // real victim later used "Continue with Google". Cost: a genuine
            // user who signed up by email/password will get "account exists"
            // if they later try Google with the same address — they just sign
            // in with their password instead, no real feature lost.
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        // Bind this session to a device so it can be revoked individually.
        token.did = await registerDevice(user.id);
      }

      // Revoking a device previously only set revokedAt and changed a label in
      // settings — the token kept working. Checked on every token read so
      // "Sign out device" ends that session; returning null invalidates it
      // (the callback's documented `JWT | null` contract).
      if (!(await deviceSessionValid(token.did))) return null;

      if (token.uid) {
        const u = await db.user.findUnique({
          where: { id: token.uid as string },
          select: { isPlatformAdmin: true, suspendedAt: true, deletedAt: true },
        });
        // Suspend/delete must kill the JWT itself, not just server-action
        // access: without this a suspended user keeps a valid token until
        // expiry, and any direct auth() consumer bypasses getCurrentUser.
        // Checked for admins too — a suspended admin is still suspended.
        if (!u || u.suspendedAt || u.deletedAt) return null;
        // Always refresh from the database: a conditional set here never
        // cleared the flag, so a demoted admin kept platform access until
        // re-login on any direct auth()/session consumer.
        token.isPlatformAdmin = u.isPlatformAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid as string;
        session.user.isPlatformAdmin = (token.isPlatformAdmin as boolean) ?? false;
      }
      return session;
    },
  },
});

export const isGoogleEnabled = googleEnabled;
