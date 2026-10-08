import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** Device row this session is bound to; absent on tokens issued before device binding. */
    deviceId?: string;
    user: {
      id: string;
      isPlatformAdmin?: boolean;
      platformRole?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    isPlatformAdmin?: boolean;
    platformRole?: string | null;
  }
}
