import { db } from "@/lib/db";
import { deviceLabel, type ParsedSubscription } from "./validate";

/** A person can keep this many devices subscribed; the least recently used are dropped beyond that. */
export const MAX_PUSH_DEVICES = 10;

function cleanLabel(label: unknown, userAgent: string | null): string {
  const t = typeof label === "string" ? label.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  return t || deviceLabel(userAgent);
}

/**
 * Save (or refresh) one device. The same endpoint is one physical browser profile: if it was subscribed under another
 * account on this device, it now belongs to whoever signed in last, so the previous account stops buzzing this phone.
 */
export async function registerSubscription(userId: string, sub: ParsedSubscription, userAgent: string | null, label?: unknown): Promise<{ id: string }> {
  const ua = userAgent ? userAgent.slice(0, 300) : null;
  const row = await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: ua, label: cleanLabel(label, ua) },
    update: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent: ua, label: cleanLabel(label, ua), failureCount: 0, lastUsedAt: new Date() },
    select: { id: true },
  });
  const all = await db.pushSubscription.findMany({ where: { userId }, orderBy: { lastUsedAt: "desc" }, select: { id: true } });
  if (all.length > MAX_PUSH_DEVICES) {
    await db.pushSubscription.deleteMany({ where: { id: { in: all.slice(MAX_PUSH_DEVICES).map((r) => r.id) }, userId } });
  }
  return row;
}
