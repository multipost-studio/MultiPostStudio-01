import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendNotificationEmail } from "@/lib/adapters/email";
import { safeActionUrl } from "./links";
import { parseSettings, shouldDeliverInApp, type NotificationSettings } from "./prefs";
import {
  categoryOf,
  defaultPriorityOf,
  getTypeDef,
  isCategory,
  isPriority,
  type NotificationCategory,
  type NotificationPriority,
} from "./types";

/**
 * The one place notification rows are created, read and marked. Everything else (publishing queue,
 * approvals, billing webhooks, reminder jobs, the legacy `notify*` helpers in lib/events.ts) goes through
 * here, so preferences, safe links, de-duplication, grouping and the email policy are decided once.
 *
 * Everything is scoped by user id inside the query itself (never "find by id, then check"), and by
 * workspace where one applies, so one user's id can never read or mark another user's notification.
 */

export type NotificationExtraAction = { label: string; url: string };

export type NotifyInput = {
  userId: string;
  workspaceId?: string | null;
  type: string;
  title: string;
  body: string;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  linkUrl?: string | null;
  actionLabel?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  platform?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Makes the event idempotent per user: a webhook retry or a job re-run with the same key creates nothing
   * the second time. Build it from the event, not from the time, e.g. `billing_payment_failed:${orgId}:${invoiceNumber}`.
   */
  dedupeKey?: string | null;
  expiresAt?: Date | null;
  /** Skip the email mirror even when the type normally has one. */
  noEmail?: boolean;
  /**
   * Fold repeats into one entry: while an UNREAD notification of the same user + type + entity exists from
   * the last `windowMin` minutes, update it instead of adding another. `merge` receives the new count.
   */
  group?: {
    windowMin: number;
    merge: (count: number) => { title: string; body: string; linkUrl?: string | null; actionLabel?: string | null };
  };
};

export type NotifyResult = { created: boolean; id: string | null; reason?: "disabled" | "duplicate" | "grouped" };

const SENSITIVE_KEY = /token|secret|password|authorization|cookie|apikey|api_key/i;
const MAX_TITLE = 160;
const MAX_BODY = 600;
const MAX_METADATA = 4000;

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Metadata is for the UI (channel list, counts, extra actions). Never secrets, never unbounded. */
export function sanitizeMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null;
  const strip = (v: unknown, depth: number): unknown => {
    if (depth > 4) return undefined;
    if (Array.isArray(v)) return v.slice(0, 50).map((x) => strip(x, depth + 1));
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !SENSITIVE_KEY.test(k))
          .map(([k, x]) => [k, strip(x, depth + 1)]),
      );
    }
    return v;
  };
  const json = JSON.stringify(strip(meta, 0));
  return json && json.length <= MAX_METADATA ? json : null;
}

type PrefRow = {
  userId: string;
  inappAll: boolean;
  emailPublish: boolean;
  emailApproval: boolean;
  emailMentions: boolean;
  settings: string | null;
};

async function loadPrefs(userIds: string[]): Promise<Map<string, { row: PrefRow | null; settings: NotificationSettings }>> {
  const out = new Map<string, { row: PrefRow | null; settings: NotificationSettings }>();
  const defaults = parseSettings(null);
  userIds.forEach((id) => out.set(id, { row: null, settings: defaults }));
  if (userIds.length === 0) return out;
  try {
    const rows = await db.notificationPref.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, inappAll: true, emailPublish: true, emailApproval: true, emailMentions: true, settings: true },
    });
    for (const r of rows) out.set(r.userId, { row: r, settings: parseSettings(r.settings) });
  } catch (err) {
    // A preferences hiccup must never swallow a notification: fall back to "everything on".
    logger.warn({ err }, "notification preference lookup failed");
  }
  return out;
}

function emailAllowed(type: string, row: PrefRow | null): boolean {
  const mode = getTypeDef(type)?.email;
  if (!mode) return false;
  if (mode === "always") return true;
  return row ? row[mode] !== false : true;
}

async function emailMirror(items: { userId: string; type: string; title: string; body: string; linkUrl: string | null }[]): Promise<void> {
  if (!flags.realEmail || items.length === 0) return;
  try {
    const prefs = await loadPrefs([...new Set(items.map((i) => i.userId))]);
    const wanted = items.filter((i) => emailAllowed(i.type, prefs.get(i.userId)?.row ?? null));
    if (wanted.length === 0) return;
    const users = await db.user.findMany({
      where: { id: { in: [...new Set(wanted.map((w) => w.userId))] }, deletedAt: null },
      select: { id: true, email: true, name: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    await Promise.all(
      wanted.map(async (w) => {
        const u = byId.get(w.userId);
        if (!u) return;
        try {
          await sendNotificationEmail({ to: u.email, name: u.name, title: w.title, body: w.body, linkUrl: w.linkUrl ?? undefined });
        } catch (err) {
          logger.warn({ err, userId: w.userId, type: w.type }, "notification email failed");
        }
      }),
    );
  } catch (err) {
    logger.warn({ err }, "notification email mirror failed");
  }
}

function toRow(input: NotifyInput) {
  const type = input.type;
  const category = input.category && isCategory(input.category) ? input.category : categoryOf(type);
  const priority = input.priority && isPriority(input.priority) ? input.priority : defaultPriorityOf(type);
  return {
    userId: input.userId,
    workspaceId: input.workspaceId ?? null,
    type,
    category,
    priority,
    title: clip(input.title, MAX_TITLE),
    body: clip(input.body, MAX_BODY),
    linkUrl: safeActionUrl(input.linkUrl, { allowExternalHttps: type === "system" }),
    actionLabel: input.actionLabel ? clip(input.actionLabel, 40) : null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    platform: input.platform ?? null,
    metadata: sanitizeMetadata(input.metadata),
    dedupeKey: input.dedupeKey ?? null,
    expiresAt: input.expiresAt ?? null,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Create (or de-duplicate / group) one notification for one user. Never throws: a notification must not break its caller. */
export async function createNotification(input: NotifyInput): Promise<NotifyResult> {
  try {
    const prefs = await loadPrefs([input.userId]);
    const p = prefs.get(input.userId)!;
    const row = toRow(input);
    const inApp = shouldDeliverInApp(row.type, p.settings, p.row?.inappAll ?? true);

    if (!inApp) {
      await emailMirror(input.noEmail ? [] : [row]);
      return { created: false, id: null, reason: "disabled" };
    }

    if (input.group && row.entityType && row.entityId) {
      const since = new Date(Date.now() - input.group.windowMin * 60_000);
      const existing = await db.notification.findFirst({
        where: { userId: row.userId, type: row.type, entityType: row.entityType, entityId: row.entityId, readAt: null, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: { id: true, metadata: true },
      });
      if (existing) {
        let prior = 1;
        try {
          prior = Number((JSON.parse(existing.metadata ?? "{}") as { count?: number }).count) || 1;
        } catch {
          prior = 1;
        }
        const count = prior + 1;
        const merged = input.group.merge(count);
        await db.notification.update({
          where: { id: existing.id },
          data: {
            title: clip(merged.title, MAX_TITLE),
            body: clip(merged.body, MAX_BODY),
            ...(merged.linkUrl !== undefined ? { linkUrl: safeActionUrl(merged.linkUrl, { allowExternalHttps: row.type === "system" }) } : {}),
            ...(merged.actionLabel !== undefined ? { actionLabel: merged.actionLabel } : {}),
            metadata: sanitizeMetadata({ ...(input.metadata ?? {}), count }),
            createdAt: new Date(),
          },
        });
        return { created: false, id: existing.id, reason: "grouped" };
      }
    }

    let id: string;
    try {
      const created = await db.notification.create({ data: row, select: { id: true } });
      id = created.id;
    } catch (err) {
      if (isUniqueViolation(err)) return { created: false, id: null, reason: "duplicate" };
      throw err;
    }
    if (!input.noEmail) await emailMirror([row]);
    return { created: true, id };
  } catch (err) {
    logger.error({ err, type: input.type, userId: input.userId }, "createNotification failed");
    return { created: false, id: null };
  }
}

/** Same notification for many users, in one round trip for the common (no grouping) case. */
export async function createForUsers(userIds: string[], base: Omit<NotifyInput, "userId">): Promise<{ created: number }> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { created: 0 };
  try {
    if (base.group) {
      let created = 0;
      for (const userId of ids) {
        const r = await createNotification({ ...base, userId });
        if (r.created) created++;
      }
      return { created };
    }
    const prefs = await loadPrefs(ids);
    const proto = toRow({ ...base, userId: ids[0] });
    const inAppIds = ids.filter((id) => {
      const p = prefs.get(id)!;
      return shouldDeliverInApp(proto.type, p.settings, p.row?.inappAll ?? true);
    });
    let fresh = inAppIds;
    if (proto.dedupeKey && inAppIds.length > 0) {
      const dup = await db.notification.findMany({
        where: { userId: { in: inAppIds }, dedupeKey: proto.dedupeKey },
        select: { userId: true },
      });
      const seen = new Set(dup.map((d) => d.userId));
      fresh = inAppIds.filter((id) => !seen.has(id));
    }
    if (fresh.length > 0) {
      await db.notification.createMany({ data: fresh.map((userId) => ({ ...proto, userId })), skipDuplicates: true });
    }
    // Email goes to everyone whose in-app copy was created, plus people who switched in-app off (their email switches still apply).
    const emailTargets = ids.filter((id) => fresh.includes(id) || !inAppIds.includes(id));
    if (!base.noEmail) await emailMirror(emailTargets.map((userId) => ({ ...proto, userId })));
    return { created: fresh.length };
  } catch (err) {
    logger.error({ err, type: base.type }, "createForUsers failed");
    return { created: 0 };
  }
}

/** Every member of a workspace (optionally skipping the person who caused the event, or limited to roles). */
export async function createForWorkspace(
  workspaceId: string,
  base: Omit<NotifyInput, "userId" | "workspaceId">,
  opts: { exceptUserId?: string; roles?: string[] } = {},
): Promise<{ created: number }> {
  try {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId, ...(opts.roles ? { role: { in: opts.roles } } : {}) },
      select: { userId: true },
    });
    const ids = members.map((m) => m.userId).filter((id) => id !== opts.exceptUserId);
    return await createForUsers(ids, { ...base, workspaceId });
  } catch (err) {
    logger.error({ err, workspaceId, type: base.type }, "createForWorkspace failed");
    return { created: 0 };
  }
}

/** Owners and admins of an organisation: the people who can act on billing. Not tied to one workspace. */
export async function createForOrgAdmins(orgId: string, base: Omit<NotifyInput, "userId" | "workspaceId">): Promise<{ created: number }> {
  try {
    const admins = await db.membership.findMany({
      where: { orgId, status: "active", role: { in: ["owner", "admin"] } },
      select: { userId: true },
    });
    return await createForUsers(
      admins.map((a) => a.userId),
      { ...base, workspaceId: null },
    );
  } catch (err) {
    logger.error({ err, orgId, type: base.type }, "createForOrgAdmins failed");
    return { created: 0 };
  }
}

/* ------------------------------------------------------------------ reads */

type Scope = { userId: string; workspaceId: string | null };

/** A user sees their own notifications for the workspace they are in, plus account-wide ones (no workspace). */
function visibleConditions(scope: Scope, now: Date): Prisma.NotificationWhereInput[] {
  return [
    { OR: [{ workspaceId: null }, ...(scope.workspaceId ? [{ workspaceId: scope.workspaceId }] : [])] },
    { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  ];
}

export function visibleWhere(scope: Scope, now = new Date()): Prisma.NotificationWhereInput {
  return { userId: scope.userId, AND: visibleConditions(scope, now) };
}

export async function getUnreadCount(scope: Scope): Promise<number> {
  return db.notification.count({ where: { ...visibleWhere(scope), readAt: null } });
}

export type NotificationFilter =
  | "all"
  | "unread"
  | "read"
  | "mentions"
  | "publishing"
  | "scheduling"
  | "engagement"
  | "team"
  | "account"
  | "billing"
  | "system";

export const FILTERS: readonly NotificationFilter[] = ["all", "unread", "read", "publishing", "scheduling", "engagement", "mentions", "team", "account", "billing", "system"];

export function isFilter(v: unknown): v is NotificationFilter {
  return typeof v === "string" && (FILTERS as readonly string[]).includes(v);
}

function filterWhere(filter: NotificationFilter): Prisma.NotificationWhereInput {
  if (filter === "all") return {};
  if (filter === "unread") return { readAt: null };
  if (filter === "read") return { readAt: { not: null } };
  return { category: filter };
}

export type NotificationDTO = {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  linkUrl: string | null;
  actionLabel: string | null;
  platform: string | null;
  workspaceId: string | null;
  count: number;
  actions: NotificationExtraAction[];
  readAt: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  type: string;
  category: string;
  priority: string;
  title: string;
  body: string;
  linkUrl: string | null;
  actionLabel: string | null;
  platform: string | null;
  workspaceId: string | null;
  metadata: string | null;
  readAt: Date | null;
  createdAt: Date;
};

const ROW_SELECT = {
  id: true,
  type: true,
  category: true,
  priority: true,
  title: true,
  body: true,
  linkUrl: true,
  actionLabel: true,
  platform: true,
  workspaceId: true,
  metadata: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export function toDTO(r: Row): NotificationDTO {
  let meta: { count?: unknown; actions?: unknown } = {};
  try {
    meta = r.metadata ? (JSON.parse(r.metadata) as typeof meta) : {};
  } catch {
    meta = {};
  }
  const actions = Array.isArray(meta.actions)
    ? (meta.actions as unknown[])
        .map((a) => {
          const o = a as { label?: unknown; url?: unknown };
          const url = safeActionUrl(typeof o.url === "string" ? o.url : null);
          return typeof o.label === "string" && url ? { label: clip(o.label, 40), url } : null;
        })
        .filter((a): a is NotificationExtraAction => a !== null)
        .slice(0, 3)
    : [];
  return {
    id: r.id,
    type: r.type,
    category: isCategory(r.category) ? r.category : categoryOf(r.type),
    priority: isPriority(r.priority) ? r.priority : "normal",
    title: r.title,
    body: r.body,
    // Re-checked on the way out: rows written before the safe-link rule (or by raw SQL) are held to it too.
    linkUrl: safeActionUrl(r.linkUrl, { allowExternalHttps: r.type === "system" }),
    actionLabel: r.actionLabel,
    platform: r.platform,
    workspaceId: r.workspaceId,
    count: typeof meta.count === "number" && meta.count > 1 ? Math.min(meta.count, 999) : 1,
    actions,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

function encodeCursor(r: { createdAt: Date; id: string }): string {
  return Buffer.from(`${r.createdAt.toISOString()}|${r.id}`).toString("base64url");
}

function decodeCursor(c: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!c) return null;
  try {
    const [iso, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) || !id ? null : { createdAt: d, id };
  } catch {
    return null;
  }
}

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;

export async function listNotifications(
  scope: Scope,
  opts: { filter?: NotificationFilter; cursor?: string | null; limit?: number; q?: string | null } = {},
): Promise<{ items: NotificationDTO[]; nextCursor: string | null; unread: number }> {
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, Math.floor(opts.limit ?? PAGE_SIZE_DEFAULT)));
  const cur = decodeCursor(opts.cursor);
  const q = opts.q?.trim().slice(0, 100);
  const and: Prisma.NotificationWhereInput[] = [filterWhere(opts.filter ?? "all")];
  if (cur) and.push({ OR: [{ createdAt: { lt: cur.createdAt } }, { createdAt: cur.createdAt, id: { lt: cur.id } }] });
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] });

  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: scope.userId, AND: [...visibleConditions(scope, new Date()), ...and] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: ROW_SELECT,
    }),
    getUnreadCount(scope),
  ]);
  const page = rows.slice(0, limit);
  return {
    items: page.map(toDTO),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    unread,
  };
}

/* ----------------------------------------------------------------- writes */

/** Mark one notification read. The user id is part of the WHERE, so someone else's id matches nothing. */
export async function markAsRead(userId: string, id: string): Promise<boolean> {
  const r = await db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  return r.count > 0;
}

export async function markAsUnread(userId: string, id: string): Promise<boolean> {
  const r = await db.notification.updateMany({ where: { id, userId, readAt: { not: null } }, data: { readAt: null } });
  return r.count > 0;
}

export async function markAllAsRead(scope: Scope, filter: NotificationFilter = "all"): Promise<number> {
  const r = await db.notification.updateMany({
    where: { ...visibleWhere(scope), ...(filter === "all" || filter === "unread" || filter === "read" ? {} : filterWhere(filter)), readAt: null },
    data: { readAt: new Date() },
  });
  return r.count;
}

export async function deleteNotification(userId: string, id: string): Promise<boolean> {
  const r = await db.notification.deleteMany({ where: { id, userId } });
  return r.count > 0;
}

/* -------------------------------------------------------------- retention */

export const READ_RETENTION_DAYS = 60;
export const UNREAD_RETENTION_DAYS = 180;

/**
 * Housekeeping for the janitor: expired reminders go, read notifications age out after two months, and
 * anything still unread after six. Bounded per run so a large backlog can never stall a tick.
 */
export async function cleanupNotifications(now = new Date()): Promise<{ expired: number; read: number; stale: number }> {
  const day = 86_400_000;
  const expired = await db.notification.deleteMany({ where: { expiresAt: { lt: now } } });
  const read = await db.notification.deleteMany({
    where: { readAt: { not: null }, createdAt: { lt: new Date(now.getTime() - READ_RETENTION_DAYS * day) } },
  });
  const stale = await db.notification.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - UNREAD_RETENTION_DAYS * day) } },
  });
  return { expired: expired.count, read: read.count, stale: stale.count };
}
