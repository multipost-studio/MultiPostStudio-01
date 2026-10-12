import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Delivery events from Resend. Resend signs its webhooks with Svix: the signature is HMAC-SHA256 over
 * `${svix-id}.${svix-timestamp}.${rawBody}`, keyed with the base64 part of the `whsec_…` secret, sent as space-separated
 * `v1,<base64>` values (more than one while a secret is being rotated). A timestamp more than five minutes off is
 * refused, so a captured request cannot be replayed later. Pure.
 */
const TOLERANCE_SEC = 300;

export function verifySvix(secret: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, rawBody: string, nowMs: number = Date.now()): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_SEC) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest();
  for (const part of headers.signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export type EmailStatus = "sent" | "stub" | "failed" | "delivered" | "bounced" | "complained";
export type EventEffect = { status?: EmailStatus; opened?: true; clicked?: true };

/** What a Resend event type changes on our log row. Unknown events change nothing. */
export function effectOf(eventType: string): EventEffect | null {
  switch (eventType) {
    case "email.delivered": return { status: "delivered" };
    case "email.bounced": return { status: "bounced" };
    case "email.complained": return { status: "complained" };
    case "email.failed": return { status: "failed" };
    case "email.opened": return { opened: true };
    case "email.clicked": return { clicked: true };
    default: return null;
  }
}

const RANK: Record<string, number> = { stub: 0, sent: 0, delivered: 1, failed: 2, bounced: 2, complained: 3 };

/** Events can arrive late or twice. A row never moves back to a milder state: a bounce stays a bounce even if "delivered" arrives afterwards. */
export function mergeStatus(current: string, next: EmailStatus): EmailStatus {
  return (RANK[next] ?? 0) >= (RANK[current] ?? 0) ? next : (current as EmailStatus);
}
