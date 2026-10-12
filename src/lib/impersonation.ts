import { createHmac, timingSafeEqual } from "node:crypto";
import { requireAuthSecret } from "@/lib/env";

const COOKIE_NAME = "mps_impersonate";

/** How long a support session lasts. Read-only is the default and may run longer than one that can change content. */
export const IMPERSONATION_TTL_SECONDS = { view: 60 * 60, edit: 30 * 60 } as const;
export type ImpersonationMode = keyof typeof IMPERSONATION_TTL_SECONDS;

export interface ImpersonationPayload {
  /** Id of the server-side ImpersonationSession row. The row, not this token, decides whether the session is still valid. */
  sid: string;
  adminId: string;
  targetUserId: string;
  exp: number;
}

function getSecret(): string {
  // Same rule as the session secret: never sign with the public placeholder in production. (This used to fall back to a
  // constant string, which would have let anyone who read the repository forge a token on a deployment missing AUTH_SECRET.)
  return requireAuthSecret();
}

export function signImpersonationToken(sid: string, adminId: string, targetUserId: string, ttlSeconds: number = IMPERSONATION_TTL_SECONDS.view): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: ImpersonationPayload = { sid, adminId, targetUserId, exp };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${signature}`;
}

/**
 * Checks the signature and expiry only. Whether the session has been ended is a database question, answered by
 * getCurrentUser (lib/session.ts). A token minted before sessions were stored (no sid) is refused.
 */
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

    if (!payload.sid || !payload.adminId || !payload.targetUserId) return null;
    return payload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME as IMPERSONATION_COOKIE };

/** Shown instead of performing an account-control action while an administrator is viewing as a customer. */
export const IMPERSONATION_BLOCKED_MESSAGE =
  "This can't be done while viewing as another user. Stop viewing as them first, or ask the account owner to do it.";

/** Shown when a read-only support session tries to change something. */
export const IMPERSONATION_VIEW_ONLY_MESSAGE =
  "You're viewing this account read-only. End this session and start an edit session (a written reason is required) to make changes.";

/**
 * Permissions that change who can get into an account, what it pays, or what it is connected to. A support session is
 * for looking and for ordinary content help; these stay with the customer even in an edit session.
 */
export const IMPERSONATION_BLOCKED_PERMISSIONS: ReadonlySet<string> = new Set([
  "members.manage",
  "billing.manage",
  "integrations.manage",
  "channels.connect",
  "workspace.manage",
  "ai.providers.manage",
]);

/** The only permission a read-only session may exercise through an action: reading analytics. Everything else is a change. */
export const IMPERSONATION_VIEW_PERMISSIONS: ReadonlySet<string> = new Set(["analytics.view"]);

export class ImpersonationBlockedError extends Error {
  constructor(message: string = IMPERSONATION_BLOCKED_MESSAGE) {
    super(message);
    this.name = "ImpersonationBlockedError";
  }
}

/** The mode a request is in, or null when it is not a support session. */
export function impersonationModeOf(user: { isImpersonated?: boolean; impersonationMode?: string | null } | null | undefined): ImpersonationMode | null {
  if (!user?.isImpersonated) return null;
  return user.impersonationMode === "edit" ? "edit" : "view";
}
