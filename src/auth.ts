import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

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
      },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash || user.deletedAt) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
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
            allowDangerousEmailAccountLinking: true,
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
