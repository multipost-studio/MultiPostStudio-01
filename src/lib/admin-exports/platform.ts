import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DATE_FILTER_KEYS, dateRange, type AdminQuery, type AdminQueryOpts } from "@/lib/admin-query";
import { iso, yn, type ExportDataset } from "./types";

/* --------------------------- AI provider keys --------------------------- */

export const aiQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt"],
  filterKeys: ["status", "provider", ...DATE_FILTER_KEYS],
};

export function aiWhere(query: AdminQuery): Prisma.AiProviderCredentialWhereInput {
  const where: Prisma.AiProviderCredentialWhereInput = {};
  if (query.q) {
    where.OR = [
      { workspace: { name: { contains: query.q, mode: "insensitive" } } },
      { workspace: { org: { name: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  if (query.filters.status) where.status = query.filters.status;
  if (query.filters.provider) where.provider = query.filters.provider;
  const created = dateRange(query.filters);
  if (created) where.createdAt = created;
  return where;
}

export const aiDataset: ExportDataset = {
  type: "ai",
  label: "AI providers",
  queryOpts: aiQueryOpts,
  async load(query, limit) {
    // encryptedApiKey is never selected: only the last four characters exist in this export.
    const rows = await db.aiProviderCredential.findMany({
      where: aiWhere(query),
      orderBy: { createdAt: query.dir },
      take: limit,
      select: {
        id: true,
        provider: true,
        status: true,
        keyLast4: true,
        defaultModel: true,
        lastValidatedAt: true,
        lastUsedAt: true,
        createdAt: true,
        workspace: { select: { name: true, org: { select: { name: true } } } },
      },
    });
    return {
      header: ["id", "organization", "workspace", "provider", "status", "key_last4", "default_model", "last_validated_at", "last_used_at", "created_at"],
      rows: rows.map((r) => [r.id, r.workspace.org.name, r.workspace.name, r.provider, r.status, r.keyLast4, r.defaultModel ?? "", iso(r.lastValidatedAt), iso(r.lastUsedAt), iso(r.createdAt)]),
    };
  },
};

/* ------------------------- Connected social accounts ------------------------- */

export const connectionsQueryOpts: AdminQueryOpts = {
  defaultSort: "connectedAt",
  sortable: ["connectedAt"],
  filterKeys: ["status", "platform", ...DATE_FILTER_KEYS],
};

export function connectionsWhere(query: AdminQuery): Prisma.SocialAccountWhereInput {
  const where: Prisma.SocialAccountWhereInput = {};
  if (query.q) {
    where.OR = [
      { displayName: { contains: query.q, mode: "insensitive" } },
      { handle: { contains: query.q, mode: "insensitive" } },
      { workspace: { org: { name: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  if (query.filters.status) where.status = query.filters.status;
  if (query.filters.platform) where.platform = query.filters.platform;
  const connected = dateRange(query.filters);
  if (connected) where.connectedAt = connected;
  return where;
}

export const connectionsDataset: ExportDataset = {
  type: "connections",
  label: "Connected accounts",
  queryOpts: connectionsQueryOpts,
  async load(query, limit) {
    // Access/refresh tokens are never selected.
    const rows = await db.socialAccount.findMany({
      where: connectionsWhere(query),
      orderBy: { connectedAt: query.dir },
      take: limit,
      select: {
        id: true,
        platform: true,
        displayName: true,
        handle: true,
        status: true,
        tokenExpiresAt: true,
        connectedAt: true,
        lastSyncedAt: true,
        workspace: { select: { name: true, org: { select: { name: true } } } },
        _count: { select: { channels: true } },
      },
    });
    return {
      header: ["id", "platform", "display_name", "handle", "status", "organization", "workspace", "channels", "token_expires_at", "last_synced_at", "connected_at"],
      rows: rows.map((a) => [a.id, a.platform, a.displayName, a.handle, a.status, a.workspace.org.name, a.workspace.name, a._count.channels, iso(a.tokenExpiresAt), iso(a.lastSyncedAt), iso(a.connectedAt)]),
    };
  },
};

/* ------------------------------ Feature flags ------------------------------ */

export const flagsQueryOpts: AdminQueryOpts = { defaultSort: "key", sortable: ["key"], filterKeys: ["state"] };

export function flagsWhere(query: AdminQuery): Prisma.FeatureFlagWhereInput {
  const where: Prisma.FeatureFlagWhereInput = {};
  if (query.filters.state === "on") where.enabled = true;
  if (query.filters.state === "off") where.enabled = false;
  if (query.q) where.OR = [{ key: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }];
  return where;
}

export const flagsDataset: ExportDataset = {
  type: "flags",
  label: "Feature flags",
  queryOpts: flagsQueryOpts,
  async load(query, limit) {
    const rows = await db.featureFlag.findMany({ where: flagsWhere(query), orderBy: { key: "asc" }, take: limit });
    return { header: ["key", "description", "enabled", "rollout_pct", "updated_at"], rows: rows.map((f) => [f.key, f.description, yn(f.enabled), f.rollout, iso(f.updatedAt)]) };
  },
};

/* ------------------------------- CMS content ------------------------------- */

export const cmsQueryOpts: AdminQueryOpts = { defaultSort: "collection", sortable: ["collection"], filterKeys: ["collection", "published"] };

export const cmsDataset: ExportDataset = {
  type: "cms",
  label: "CMS content",
  queryOpts: cmsQueryOpts,
  async load(query, limit) {
    const where: Prisma.CmsEntryWhereInput = {};
    if (query.filters.collection) where.collection = query.filters.collection;
    if (query.filters.published === "yes") where.published = true;
    if (query.filters.published === "no") where.published = false;
    const rows = await db.cmsEntry.findMany({ where, orderBy: [{ collection: "asc" }, { sortIndex: "asc" }], take: limit });
    return {
      header: ["id", "collection", "slug", "published", "sort_index", "data_json", "updated_at"],
      rows: rows.map((c) => [c.id, c.collection, c.slug, yn(c.published), c.sortIndex, c.data, iso(c.updatedAt)]),
    };
  },
};

/* ------------------------- Security: lockouts and admins ------------------------- */

export const securityQueryOpts: AdminQueryOpts = { defaultSort: "email", sortable: ["email"], filterKeys: ["kind"] };

/** `kind`: "lockouts" (failed or locked TOTP), "admins" (platform administrators); both when omitted. */
export function securityWhere(query: AdminQuery, now = new Date()): Prisma.UserWhereInput {
  const lockouts: Prisma.UserWhereInput = { OR: [{ twoFactorLockedUntil: { gt: now } }, { twoFactorFailedAttempts: { gt: 0 } }] };
  const admins: Prisma.UserWhereInput = { isPlatformAdmin: true };
  const kind = query.filters.kind;
  const base: Prisma.UserWhereInput = { deletedAt: null, ...(kind === "lockouts" ? lockouts : kind === "admins" ? admins : { OR: [lockouts, admins] }) };
  if (!query.q) return base;
  return { AND: [base, { OR: [{ email: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] }] };
}

export const securityDataset: ExportDataset = {
  type: "security",
  label: "Security accounts",
  queryOpts: securityQueryOpts,
  async load(query, limit) {
    const now = new Date();
    // 2FA secrets and backup codes are never selected.
    const rows = await db.user.findMany({
      where: securityWhere(query, now),
      orderBy: { email: query.dir === "desc" ? "desc" : "asc" },
      take: limit,
      select: { email: true, name: true, isPlatformAdmin: true, twoFactorEnabled: true, twoFactorFailedAttempts: true, twoFactorLockedUntil: true, suspendedAt: true },
    });
    return {
      header: ["email", "name", "platform_admin", "two_factor_enabled", "failed_attempts", "locked_until", "locked_now", "suspended"],
      rows: rows.map((u) => [u.email, u.name, yn(u.isPlatformAdmin), yn(u.twoFactorEnabled), u.twoFactorFailedAttempts, iso(u.twoFactorLockedUntil), yn(!!u.twoFactorLockedUntil && u.twoFactorLockedUntil > now), yn(!!u.suspendedAt)]),
    };
  },
};
