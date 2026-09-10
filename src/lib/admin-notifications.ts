import { cache } from "react";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  SIGNALS,
  type AdminSignal,
  type SignalItem,
  type SignalPriority,
} from "@/lib/admin-signals";

/**
 * Turns the signal registry into what the admin UI needs: a per-module badge
 * count, a priority for each badge, and the grouped item list for the
 * notification centre — with each item marked read/unread for the current
 * admin.
 *
 * An item counts toward a badge when it is unread, OR when its signal is
 * `persistent` (an unresolved problem still counts even after it's been
 * acknowledged). So "mark all read" quiets new signups and new orgs but
 * leaves a past-due subscription badge lit until the payment actually clears.
 */

const PRIORITY_RANK: Record<SignalPriority, number> = { info: 0, warn: 1, critical: 2 };

export type CentreItem = SignalItem & {
  signalKey: string;
  module: string;
  title: string;
  priority: SignalPriority;
  persistent: boolean;
  seen: boolean;
  /** counts toward the badge right now */
  counts: boolean;
};

export type ModuleBadge = { count: number; priority: SignalPriority };

export type AdminNotifications = {
  /** keyed by ADMIN_NAV label, e.g. { Billing: { count: 2, priority: "critical" } } */
  modules: Record<string, ModuleBadge>;
  /** every item, newest first, for the centre */
  items: CentreItem[];
  /** grouped for display: signal → its items */
  groups: { signal: AdminSignal; items: CentreItem[] }[];
  totalUnread: number;
  topPriority: SignalPriority | null;
};

/** Pure: fold items into per-module badges. Exported for tests. */
export function rollupModules(items: Pick<CentreItem, "module" | "priority" | "counts">[]): Record<string, ModuleBadge> {
  const out: Record<string, ModuleBadge> = {};
  for (const it of items) {
    if (!it.counts) continue;
    const cur = out[it.module];
    if (!cur) {
      out[it.module] = { count: 1, priority: it.priority };
    } else {
      cur.count += 1;
      if (PRIORITY_RANK[it.priority] > PRIORITY_RANK[cur.priority]) cur.priority = it.priority;
    }
  }
  return out;
}

/** Pure: whether an item counts toward the badge. Exported for tests. */
export function itemCounts(persistent: boolean, seen: boolean): boolean {
  return persistent || !seen;
}

async function loadSignal(signal: AdminSignal): Promise<{ signal: AdminSignal; items: SignalItem[] }> {
  try {
    return { signal, items: await signal.load() };
  } catch (err) {
    // One broken query must not blank the whole panel.
    logger.error({ err, signal: signal.key }, "admin signal load failed");
    return { signal, items: [] };
  }
}

export const getAdminNotifications = cache(async (adminId: string): Promise<AdminNotifications> => {
  const [loaded, seenRows] = await Promise.all([
    Promise.all(SIGNALS.map(loadSignal)),
    // Degrade to "nothing acknowledged yet" if the table isn't there — the
    // panel still shows every signal rather than erroring the admin layout.
    db.adminNotificationSeen
      .findMany({ where: { adminId }, select: { itemKey: true } })
      .catch((err) => {
        logger.error({ err }, "admin notifications: seen-state read failed");
        return [] as { itemKey: string }[];
      }),
  ]);
  const seen = new Set(seenRows.map((r) => r.itemKey));

  const groups: AdminNotifications["groups"] = [];
  const items: CentreItem[] = [];

  for (const { signal, items: raw } of loaded) {
    const persistent = !!signal.persistent;
    const enriched: CentreItem[] = raw.map((it) => {
      const isSeen = seen.has(it.key);
      return {
        ...it,
        signalKey: signal.key,
        module: signal.module,
        title: signal.title,
        priority: signal.priority,
        persistent,
        seen: isSeen,
        counts: itemCounts(persistent, isSeen),
      };
    });
    if (enriched.length > 0) groups.push({ signal, items: enriched });
    items.push(...enriched);
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  groups.sort(
    (a, b) =>
      PRIORITY_RANK[b.signal.priority] - PRIORITY_RANK[a.signal.priority] ||
      b.items.length - a.items.length,
  );

  const modules = rollupModules(items);
  const totalUnread = items.filter((i) => i.counts).length;
  const topPriority =
    (Object.values(modules).sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])[0]
      ?.priority as SignalPriority) ?? null;

  return { modules, items, groups, totalUnread, topPriority };
});

/** Mark specific item keys read for this admin. Unknown keys are ignored. */
export async function markAdminItemsSeen(adminId: string, keys: string[]): Promise<void> {
  const clean = [...new Set(keys)].filter(Boolean).slice(0, 500);
  if (clean.length === 0) return;
  await db.adminNotificationSeen.createMany({
    data: clean.map((itemKey) => ({ adminId, itemKey })),
    skipDuplicates: true,
  });
}

/** Mark every currently-showing item read for this admin. */
export async function markAllAdminSeen(adminId: string): Promise<number> {
  const { items } = await getAdminNotifications(adminId);
  const keys = items.filter((i) => !i.seen).map((i) => i.key);
  await markAdminItemsSeen(adminId, keys);
  return keys.length;
}

/**
 * Just the badge map — used by the polling endpoint, which doesn't need the
 * full item list. Still goes through the memoised loader.
 */
export async function getAdminModuleBadges(adminId: string): Promise<{
  modules: Record<string, ModuleBadge>;
  totalUnread: number;
  topPriority: SignalPriority | null;
}> {
  const { modules, totalUnread, topPriority } = await getAdminNotifications(adminId);
  return { modules, totalUnread, topPriority };
}
