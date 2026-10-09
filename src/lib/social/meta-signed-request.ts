import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Meta's deauthorize and data-deletion callbacks POST a `signed_request`: `<signature>.<payload>`, both base64url,
 * where the signature is HMAC-SHA256 of the payload (as sent, still encoded) keyed with the app secret. Anyone
 * can POST to these URLs, so nothing may be acted on until the signature checks out.
 */
export function parseSignedRequest(signed: string, secret: string): { user_id?: string } | null {
  if (typeof signed !== "string" || signed.length > 4096) return null;
  const parts = signed.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [sigPart, payloadPart] = parts;
  let sig: Buffer;
  try {
    sig = Buffer.from(sigPart, "base64url");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret).update(payloadPart).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as { algorithm?: string; user_id?: unknown };
    if (payload.algorithm && String(payload.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    const id = typeof payload.user_id === "string" || typeof payload.user_id === "number" ? String(payload.user_id) : undefined;
    return { user_id: id && /^\d{1,30}$/.test(id) ? id : undefined };
  } catch {
    return null;
  }
}

/** The secret of the Meta app Threads connects through (same resolution as the OAuth provider). */
export function threadsAppSecret(): string | null {
  return env.OAUTH_THREADS_CLIENT_SECRET ?? env.OAUTH_META_CLIENT_SECRET ?? null;
}

/** Connected Threads accounts for a Threads user id (stored in the account metadata as `remoteId`). */
export async function threadsAccountsFor(threadsUserId: string) {
  return db.socialAccount.findMany({
    where: { platform: "threads", metadata: { contains: `"remoteId":"${threadsUserId}"` } },
    select: { id: true, workspaceId: true, handle: true, workspace: { select: { orgId: true } }, _count: { select: { channels: true } } },
    take: 50,
  });
}
