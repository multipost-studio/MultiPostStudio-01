import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DATE_FILTER_KEYS, dateRange, numberFilterKeys, numberRange, type AdminQuery, type AdminQueryOpts } from "@/lib/admin-query";
import { iso, type ExportDataset } from "./types";

/* ------------------------------- Audit ------------------------------- */

export const auditQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt"],
  filterKeys: ["scope", "actor", ...DATE_FILTER_KEYS],
};

/** Audit action prefixes that can be filtered on (the part before the first dot). */
export const AUDIT_SCOPES = ["admin", "auth", "billing", "blog", "marketing", "support", "review", "promo_card", "role", "member", "apikey"] as const;

export function auditWhere(query: AdminQuery): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (query.q) {
    and.push({
      OR: [
        { action: { contains: query.q, mode: "insensitive" } },
        { targetId: { contains: query.q } },
        { actor: { email: { contains: query.q, mode: "insensitive" } } },
        { actor: { name: { contains: query.q, mode: "insensitive" } } },
      ],
    });
  }
  const scope = query.filters.scope;
  if (scope && (AUDIT_SCOPES as readonly string[]).includes(scope)) and.push({ action: { startsWith: `${scope}.` } });
  // who did it: nobody (a job or webhook), platform staff, or a customer
  const actor = query.filters.actor;
  if (actor === "system") and.push({ actorId: null });
  if (actor === "staff") and.push({ actor: { isPlatformAdmin: true } });
  if (actor === "customer") and.push({ actor: { isPlatformAdmin: false } });
  const created = dateRange(query.filters);
  if (created) and.push({ createdAt: created });
  return and.length ? { AND: and } : {};
}

export const auditDataset: ExportDataset = {
  type: "audit",
  label: "Audit log",
  queryOpts: auditQueryOpts,
  async load(query, limit) {
    const rows = await db.auditLog.findMany({
      where: auditWhere(query),
      orderBy: { createdAt: query.dir },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        action: true,
        targetType: true,
        targetId: true,
        actor: { select: { name: true, email: true } },
        org: { select: { name: true } },
      },
    });
    return {
      header: ["id", "created_at", "actor", "actor_email", "org", "action", "target_type", "target_id"],
      rows: rows.map((l) => [l.id, iso(l.createdAt), l.actor?.name ?? "system", l.actor?.email ?? "", l.org?.name ?? "", l.action, l.targetType, l.targetId]),
    };
  },
};

/* -------------------------------- Posts -------------------------------- */

export const postsQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt", "scheduledAt", "publishedAt"],
  filterKeys: ["status", "platform", ...DATE_FILTER_KEYS],
};

export function postsWhere(query: AdminQuery): Prisma.PostWhereInput {
  const where: Prisma.PostWhereInput = {};
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { author: { email: { contains: query.q, mode: "insensitive" } } },
      { workspace: { org: { name: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  if (query.filters.status) where.status = query.filters.status;
  if (query.filters.platform) where.channels = { some: { platform: query.filters.platform } };
  const created = dateRange(query.filters);
  if (created) where.createdAt = created;
  return where;
}

export const postsDataset: ExportDataset = {
  type: "posts",
  label: "Posts",
  queryOpts: postsQueryOpts,
  async load(query, limit) {
    const rows = await db.post.findMany({
      where: postsWhere(query),
      orderBy: { [query.sort]: query.dir },
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
        workspace: { select: { name: true, org: { select: { name: true } } } },
        channels: { select: { platform: true, status: true, publishedUrl: true } },
      },
    });
    return {
      header: ["id", "title", "status", "author", "author_email", "organization", "workspace", "platforms", "channel_statuses", "published_urls", "scheduled_at", "published_at", "created_at"],
      rows: rows.map((p) => [
        p.id,
        p.title ?? "",
        p.status,
        p.author?.name ?? "",
        p.author?.email ?? "",
        p.workspace.org.name,
        p.workspace.name,
        p.channels.map((c) => c.platform).join(" "),
        p.channels.map((c) => `${c.platform}:${c.status}`).join(" "),
        p.channels.map((c) => c.publishedUrl).filter(Boolean).join(" "),
        iso(p.scheduledAt),
        iso(p.publishedAt),
        iso(p.createdAt),
      ]),
    };
  },
};

/* ------------------------- Publish queue jobs ------------------------- */

export const jobsQueryOpts: AdminQueryOpts = {
  defaultSort: "runAt",
  sortable: ["runAt", "createdAt", "attempts", "status"],
  filterKeys: ["status", "health", ...numberFilterKeys("attempts"), ...DATE_FILTER_KEYS],
};

/** A queued job this far past its run time means nothing is driving the queue. */
export const JOB_OVERDUE_MS = 10 * 60_000;
/** Mirrors MAX_JOB_ATTEMPTS in lib/adapters/queue.ts (not exported there: that module is server-only): a failed job at this count will not be retried by itself. */
export const JOB_MAX_ATTEMPTS = 5;

/** Jobs that need a person, by what is wrong with them. Shared by the page counts, the filter and the tests. */
export function jobHealthWhere(health: string, now: Date): Prisma.PublishJobWhereInput | null {
  if (health === "overdue") return { status: "queued", runAt: { lt: new Date(now.getTime() - JOB_OVERDUE_MS) } };
  if (health === "stuck") return { status: "running", leaseUntil: { lt: now } };
  if (health === "exhausted") return { status: "failed", attempts: { gte: JOB_MAX_ATTEMPTS } };
  return null;
}

export function jobsWhere(query: AdminQuery, now: Date = new Date()): Prisma.PublishJobWhereInput {
  const where: Prisma.PublishJobWhereInput = {};
  if (query.q) {
    where.OR = [
      { id: { contains: query.q } },
      { postId: { contains: query.q } },
      { lastError: { contains: query.q, mode: "insensitive" } },
      { post: { title: { contains: query.q, mode: "insensitive" } } },
      { post: { workspace: { name: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  if (query.filters.status) where.status = query.filters.status;
  const attempts = numberRange(query.filters, "attempts");
  if (attempts) where.attempts = attempts;
  const health = query.filters.health ? jobHealthWhere(query.filters.health, now) : null;
  if (health) {
    Object.assign(where, health);
    // both can constrain attempts ("out of retries" means 5 or more): keep the stricter bound of each
    const h = health.attempts as { gte?: number } | undefined;
    if (h && attempts) where.attempts = { ...(attempts.lte != null ? { lte: attempts.lte } : {}), gte: Math.max(h.gte ?? 0, attempts.gte ?? 0) };
  }
  const range = dateRange(query.filters);
  if (range) where.runAt = health?.runAt ? { ...(health.runAt as object), ...range } : range;
  return where;
}

export const jobsDataset: ExportDataset = {
  type: "jobs",
  label: "Publish jobs",
  queryOpts: jobsQueryOpts,
  async load(query, limit) {
    const rows = await db.publishJob.findMany({
      where: jobsWhere(query),
      orderBy: { [query.sort]: query.dir },
      take: limit,
      select: {
        id: true,
        postId: true,
        status: true,
        attempts: true,
        runAt: true,
        startedAt: true,
        finishedAt: true,
        lastError: true,
        post: { select: { title: true, workspace: { select: { name: true, org: { select: { name: true } } } } } },
      },
    });
    return {
      header: ["id", "post_id", "post_title", "organization", "workspace", "status", "attempts", "run_at", "started_at", "finished_at", "last_error"],
      rows: rows.map((j) => [j.id, j.postId, j.post.title ?? "", j.post.workspace.org.name, j.post.workspace.name, j.status, j.attempts, iso(j.runAt), iso(j.startedAt), iso(j.finishedAt), j.lastError ?? ""]),
    };
  },
};

/* ------------------------- System events (telemetry) ------------------------- */

export const eventsQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt"],
  filterKeys: ["level", "source", ...DATE_FILTER_KEYS],
  defaultPerPage: 50,
};

export function eventsWhere(query: AdminQuery): Prisma.SystemEventWhereInput {
  const where: Prisma.SystemEventWhereInput = {};
  if (query.q) {
    where.OR = [
      { message: { contains: query.q, mode: "insensitive" } },
      { source: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.filters.level) where.level = query.filters.level;
  if (query.filters.source) where.source = query.filters.source;
  const created = dateRange(query.filters);
  if (created) where.createdAt = created;
  return where;
}

export const eventsDataset: ExportDataset = {
  type: "events",
  label: "System events",
  queryOpts: eventsQueryOpts,
  async load(query, limit) {
    const rows = await db.systemEvent.findMany({ where: eventsWhere(query), orderBy: { createdAt: query.dir }, take: limit, select: { id: true, createdAt: true, level: true, source: true, message: true } });
    return { header: ["id", "created_at", "level", "source", "message"], rows: rows.map((e) => [e.id, iso(e.createdAt), e.level, e.source, e.message]) };
  },
};

/* ---------------------------- Privacy requests ---------------------------- */

export const privacyQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt"],
  filterKeys: ["status", "type", ...DATE_FILTER_KEYS],
};

export function privacyWhere(query: AdminQuery): Prisma.PrivacyRequestWhereInput {
  const where: Prisma.PrivacyRequestWhereInput = {};
  if (query.filters.status) where.status = query.filters.status;
  if (query.filters.type) where.type = query.filters.type;
  if (query.q) {
    where.OR = [
      { user: { email: { contains: query.q, mode: "insensitive" } } },
      { user: { name: { contains: query.q, mode: "insensitive" } } },
      { details: { contains: query.q, mode: "insensitive" } },
    ];
  }
  const created = dateRange(query.filters);
  if (created) where.createdAt = created;
  return where;
}

export const privacyDataset: ExportDataset = {
  type: "privacy",
  label: "Privacy requests",
  queryOpts: privacyQueryOpts,
  async load(query, limit) {
    const rows = await db.privacyRequest.findMany({
      where: privacyWhere(query),
      orderBy: { createdAt: query.dir },
      take: limit,
      include: { user: { select: { name: true, email: true } } },
    });
    return {
      header: ["id", "type", "status", "name", "email", "details", "resolution_note", "created_at", "resolved_at", "days_open"],
      rows: rows.map((r) => [
        r.id,
        r.type,
        r.status,
        r.user.name,
        r.user.email,
        r.details ?? "",
        r.resolutionNote ?? "",
        iso(r.createdAt),
        iso(r.resolvedAt),
        Math.max(0, Math.floor(((r.resolvedAt ?? new Date()).getTime() - r.createdAt.getTime()) / 86_400_000)),
      ]),
    };
  },
};

/* ------------------------------ Support tickets ------------------------------ */

export const supportQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt"],
  filterKeys: ["status", "kind", "assignee", "priority", ...DATE_FILTER_KEYS],
};

/** The support queue defaults to everything still waiting on us when no status is chosen. */
export function supportWhere(query: AdminQuery): Prisma.SupportTicketWhereInput {
  const f = query.filters;
  const status = f.status ?? "waiting";
  const where: Prisma.SupportTicketWhereInput = {};
  if (status === "waiting") where.status = { in: ["open", "pending"] };
  else if (status !== "all") where.status = status;
  if (f.kind && f.kind !== "all") where.kind = f.kind;
  if (f.priority && f.priority !== "all") where.priority = f.priority;
  if (f.assignee === "unassigned") where.assignedToId = null;
  else if (f.assignee && f.assignee !== "all") where.assignedToId = f.assignee;
  if (query.q) {
    where.OR = [
      { subject: { contains: query.q, mode: "insensitive" } },
      { body: { contains: query.q, mode: "insensitive" } },
      { user: { email: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  const created = dateRange(f);
  if (created) where.createdAt = created;
  return where;
}

export const supportDataset: ExportDataset = {
  type: "support",
  label: "Support tickets",
  queryOpts: supportQueryOpts,
  async load(query, limit) {
    const rows = await db.supportTicket.findMany({
      where: supportWhere(query),
      orderBy: [{ lastReplyAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: limit,
      include: {
        user: { select: { name: true, email: true } },
        org: { select: { name: true } },
        assignedTo: { select: { email: true } },
        _count: { select: { messages: true } },
      },
    });
    return {
      header: ["id", "subject", "kind", "status", "priority", "requester", "requester_email", "organization", "assigned_to", "messages", "last_reply_role", "last_reply_at", "created_at"],
      rows: rows.map((t) => [t.id, t.subject, t.kind, t.status, t.priority, t.user.name, t.user.email, t.org?.name ?? "", t.assignedTo?.email ?? "", t._count.messages, t.lastReplyRole ?? "", iso(t.lastReplyAt), iso(t.createdAt)]),
    };
  },
};

/* ------------------------------ Broadcasts ------------------------------ */

export const broadcastsQueryOpts: AdminQueryOpts = { defaultSort: "createdAt", sortable: ["createdAt"], filterKeys: [...DATE_FILTER_KEYS] };

export function broadcastsWhere(query: AdminQuery): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = { type: "system" };
  if (query.q) where.OR = [{ title: { contains: query.q, mode: "insensitive" } }, { body: { contains: query.q, mode: "insensitive" } }];
  const created = dateRange(query.filters);
  if (created) where.createdAt = created;
  return where;
}

export const broadcastsDataset: ExportDataset = {
  type: "broadcasts",
  label: "Broadcasts",
  queryOpts: broadcastsQueryOpts,
  async load(query, limit) {
    // One row per distinct broadcast; `recipients` is how many users received it.
    const groups = await db.notification.groupBy({
      by: ["title", "body"],
      where: broadcastsWhere(query),
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: query.dir } },
      take: limit,
    });
    return {
      header: ["title", "body", "recipients", "last_sent_at"],
      rows: groups.map((g) => [g.title, g.body ?? "", g._count._all, iso(g._max.createdAt)]),
    };
  },
};
