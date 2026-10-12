import { db } from "@/lib/db";
import { env, flags, appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mapConcurrent } from "@/lib/utils";
import type { NotificationSettings } from "@/lib/notifications/prefs";
import type { NotificationCategory, NotificationPriority } from "@/lib/notifications/types";
import { shouldPush } from "./policy";

/**
 * Sending Web Push. Everything here is best effort: a push is an extra way to reach someone, never a reason for the
 * notification, the request that caused it, or the publish worker to fail. Nothing in this file throws to its caller.
 */

export type PushItem = {
  userId: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  linkUrl: string | null;
  entityId?: string | null;
  notificationId?: string | null;
};

export type PushPayload = {
  title: string;
  body: string;
  /** Same-origin path to open on click. */
  url: string;
  /** Replaces an earlier notification for the same thing instead of stacking. */
  tag: string;
  id: string | null;
  priority: NotificationPriority;
  /** Unread count for the app icon badge. */
  badge: number;
  ts: number;
};

const SEND_TIMEOUT_MS = 6_000;
const CONCURRENCY = 6;
/** A device that keeps failing for another reason than "gone" is dropped after this many tries in a row. */
const MAX_FAILURES = 8;
const TTL_SECONDS: Record<NotificationPriority, number> = { low: 3_600, normal: 6 * 3_600, high: 24 * 3_600, critical: 3 * 24 * 3_600 };
const URGENCY: Record<NotificationPriority, "very-low" | "low" | "normal" | "high"> = { low: "low", normal: "normal", high: "high", critical: "high" };

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Only a same-origin path may be opened from a notification. Anything else falls back to the notification list. */
export function safePushUrl(url: string | null | undefined): string {
  if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\") && url.length <= 500) return url;
  return "/notifications";
}

export function buildPayload(item: Pick<PushItem, "type" | "title" | "body" | "linkUrl" | "priority" | "entityId" | "notificationId">, badge: number, now = Date.now()): PushPayload {
  return {
    title: clip(item.title, 80),
    body: clip(item.body, 180),
    url: safePushUrl(item.linkUrl),
    tag: `${item.type}:${item.entityId ?? item.notificationId ?? "x"}`,
    id: item.notificationId ?? null,
    priority: item.priority,
    badge,
    ts: now,
  };
}

type WebPush = typeof import("web-push");
let configured: Promise<WebPush | null> | null = null;

function loadWebPush(): Promise<WebPush | null> {
  if (!flags.webPush) return Promise.resolve(null);
  configured ??= (async () => {
    try {
      const mod = await import("web-push");
      const webpush = (mod as unknown as { default?: WebPush }).default ?? (mod as unknown as WebPush);
      const origin = (() => {
        try {
          const u = new URL(appUrl());
          return u.protocol === "https:" ? u.origin : null;
        } catch {
          return null;
        }
      })();
      webpush.setVapidDetails(env.VAPID_SUBJECT || origin || "mailto:admin@example.com", env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
      return webpush;
    } catch (err) {
      // Bad keys must disable push, not crash anything. Say so once in the logs.
      logger.error({ err }, "web push is configured with invalid VAPID keys; push is disabled");
      return null;
    }
  })();
  return configured;
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string; failureCount: number };

export type SendOutcome = { sent: number; removed: number; failed: number };

async function deliver(webpush: WebPush, sub: SubRow, payload: PushPayload): Promise<"sent" | "removed" | "failed"> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      TTL: TTL_SECONDS[payload.priority],
      urgency: URGENCY[payload.priority],
      timeout: SEND_TIMEOUT_MS,
    });
    await db.pushSubscription.update({ where: { id: sub.id }, data: { failureCount: 0, lastSuccessAt: new Date() } }).catch(() => undefined);
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // The browser or user revoked this endpoint: it will never work again.
      await db.pushSubscription.deleteMany({ where: { id: sub.id } }).catch(() => undefined);
      return "removed";
    }
    if (sub.failureCount + 1 >= MAX_FAILURES) {
      await db.pushSubscription.deleteMany({ where: { id: sub.id } }).catch(() => undefined);
      return "removed";
    }
    await db.pushSubscription.update({ where: { id: sub.id }, data: { failureCount: { increment: 1 } } }).catch(() => undefined);
    // Never log the payload (it is the person's notification text) or the endpoint (it is a bearer address).
    logger.warn({ status, subscriptionId: sub.id }, "web push delivery failed");
    return "failed";
  }
}

/**
 * Push a batch of new notifications. `settingsByUser` carries each recipient's preferences, already loaded by the notification
 * service, so the rules (category, priority, quiet hours) are applied once, in policy.ts.
 */
export async function pushMirror(items: PushItem[], settingsByUser: Map<string, NotificationSettings>): Promise<SendOutcome> {
  const out: SendOutcome = { sent: 0, removed: 0, failed: 0 };
  if (!flags.webPush || items.length === 0) return out;
  try {
    const webpush = await loadWebPush();
    if (!webpush) return out;
    const userIds = [...new Set(items.map((i) => i.userId))];
    const [subs, users, unread] = await Promise.all([
      db.pushSubscription.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true, failureCount: true } }),
      db.user.findMany({ where: { id: { in: userIds }, deletedAt: null, suspendedAt: null }, select: { id: true, timezone: true } }),
      db.notification.groupBy({ by: ["userId"], where: { userId: { in: userIds }, readAt: null }, _count: { _all: true } }),
    ]);
    if (subs.length === 0) return out;
    const zone = new Map(users.map((u) => [u.id, u.timezone]));
    const badge = new Map(unread.map((u) => [u.userId, u._count._all]));
    const bySub = new Map<string, SubRow[]>();
    for (const s of subs) bySub.set(s.userId, [...(bySub.get(s.userId) ?? []), s]);

    const jobs: { sub: SubRow; payload: PushPayload }[] = [];
    const now = new Date();
    for (const item of items) {
      if (!zone.has(item.userId)) continue; // deleted or suspended
      const settings = settingsByUser.get(item.userId);
      if (!settings || !shouldPush({ type: item.type, category: item.category, priority: item.priority, settings, timeZone: zone.get(item.userId), now })) continue;
      const payload = buildPayload(item, badge.get(item.userId) ?? 0, now.getTime());
      for (const sub of bySub.get(item.userId) ?? []) jobs.push({ sub, payload });
    }
    if (jobs.length === 0) return out;

    const results = await mapConcurrent(jobs, CONCURRENCY, ({ sub, payload }) => deliver(webpush, sub, payload));
    for (const r of results) out[r]++;
  } catch (err) {
    logger.warn({ err }, "web push mirror failed");
  }
  return out;
}

/** Send one test notification to every device a person has registered, ignoring their filters. For the settings screen. */
export async function sendTestPush(userId: string): Promise<{ ok: boolean; sent: number; devices: number; reason?: string }> {
  if (!flags.webPush) return { ok: false, sent: 0, devices: 0, reason: "not-configured" };
  const webpush = await loadWebPush();
  if (!webpush) return { ok: false, sent: 0, devices: 0, reason: "not-configured" };
  const subs = await db.pushSubscription.findMany({ where: { userId }, select: { id: true, endpoint: true, p256dh: true, auth: true, failureCount: true } });
  if (subs.length === 0) return { ok: false, sent: 0, devices: 0, reason: "no-devices" };
  const unread = await db.notification.count({ where: { userId, readAt: null } }).catch(() => 0);
  const payload = buildPayload(
    { type: "test", title: "Notifications are on", body: "This is how MultiPost Studio will reach you when the app is closed.", linkUrl: "/settings/notifications", priority: "normal", entityId: "test", notificationId: null },
    unread,
  );
  const results = await mapConcurrent(subs, CONCURRENCY, (sub) => deliver(webpush, sub, payload));
  const sent = results.filter((r) => r === "sent").length;
  return { ok: sent > 0, sent, devices: subs.length, ...(sent === 0 ? { reason: "delivery-failed" } : {}) };
}
