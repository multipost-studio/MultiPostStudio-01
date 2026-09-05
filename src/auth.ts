import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { verifyTotpCode } from "@/lib/totp";

const googleEnabled = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
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
          if (!user.twoFactorSecret || !verifyTotpCode(user.twoFactorSecret, String(creds?.code ?? ""))) return null;
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
      if (user?.id) token.uid = user.id;
      if (token.uid && !token.isPlatformAdmin) {
        const u = await db.user.findUnique({
          where: { id: token.uid as string },
          select: { isPlatformAdmin: true },
        });
        token.isPlatformAdmin = u?.isPlatformAdmin ?? false;
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
