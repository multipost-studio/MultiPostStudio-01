import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const COOKIE_NAME = "mps_impersonate";
const TTL_SECONDS = 60 * 60; // 1 hour

export interface ImpersonationPayload {
  adminId: string;
  targetUserId: string;
  exp: number;
}

function getSecret(): string {
  return env.AUTH_SECRET || "fallback-secret-for-dev-only-min16";
}

export function signImpersonationToken(adminId: string, targetUserId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload: ImpersonationPayload = { adminId, targetUserId, exp };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function verifyImpersonationToken(token: string): ImpersonationPayload | null {
  try {
    const [data, signature] = token.split(".");
    if (!data || !signature) return null;

    const expectedSig = createHmac("sha256", getSecret()).update(data).digest("base64url");
    const sigBuf = Buffer.from(signature);
    const expSigBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expSigBuf.length || !timingSafeEqual(sigBuf, expSigBuf)) {
      return null;
    }

    const payload: ImpersonationPayload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (!payload.adminId || !payload.targetUserId) return null;
    return payload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME as IMPERSONATION_COOKIE };
