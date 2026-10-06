import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DATE_FILTER_KEYS, dateRange, type AdminQuery, type AdminQueryOpts } from "@/lib/admin-query";
import { iso, yn, type ExportDataset } from "./types";

/* ------------------------------ Users ------------------------------ */

export const usersQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt", "name", "email"],
  filterKeys: ["status", "verified", "admin", ...DATE_FILTER_KEYS],
};

export function usersWhere(query: AdminQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (query.q) {
    where.OR = [
      { email: { contains: query.q, mode: "insensitive" } },
      { name: { contains: query.q, mode: "insensitive" } },
    ];
  }
  const f = query.filters;
  if (f.status === "suspended") where.suspendedAt = { not: null };
  if (f.status === "active") where.suspendedAt = null;
  if (f.status === "deleted") where.deletedAt = { not: null };
  if (f.verified === "yes") where.emailVerified = { not: null };
  if (f.verified === "no") where.emailVerified = null;
  if (f.admin === "yes") where.isPlatformAdmin = true;
  const created = dateRange(f);
  if (created) where.createdAt = created;
  return where;
}

export const usersDataset: ExportDataset = {
  type: "users",
  label: "Users",
  queryOpts: usersQueryOpts,
  async load(query, limit) {
    const rows = await db.user.findMany({
      where: usersWhere(query),
      orderBy: { [query.sort]: query.dir },
      take: limit,
      // Only exported columns: credential hashes and 2FA secrets never leave the database.
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        isPlatformAdmin: true,
        suspendedAt: true,
        deletedAt: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    });
    return {
      header: ["id", "name", "email", "verified", "platform_admin", "suspended", "deleted", "orgs", "created_at"],
      rows: rows.map((u) => [u.id, u.name, u.email, yn(!!u.emailVerified), yn(u.isPlatformAdmin), yn(!!u.suspendedAt), yn(!!u.deletedAt), u._count.memberships, iso(u.createdAt)]),
    };
  },
};

/* --------------------------- Organizations --------------------------- */

export const orgsQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt", "name", "type"],
  filterKeys: ["plan", "type", "deleted", ...DATE_FILTER_KEYS],
};

export function orgsWhere(query: AdminQuery): Prisma.OrganizationWhereInput {
  const where: Prisma.OrganizationWhereInput = {};
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { slug: { contains: query.q, mode: "insensitive" } },
    ];
  }
  const f = query.filters;
  if (f.type) where.type = f.type;
  if (f.deleted === "yes") where.deletedAt = { not: null };
  if (f.deleted === "no") where.deletedAt = null;
  if (f.plan) where.subscription = { plan: { key: f.plan } };
  const created = dateRange(f);
  if (created) where.createdAt = created;
  return where;
}

export const orgsDataset: ExportDataset = {
  type: "orgs",
  label: "Organizations",
  queryOpts: orgsQueryOpts,
  async load(query, limit) {
    const rows = await db.organization.findMany({
      where: orgsWhere(query),
      orderBy: { [query.sort]: query.dir },
      take: limit,
      include: { subscription: { include: { plan: true } }, _count: { select: { memberships: true, workspaces: true } } },
    });
    return {
      header: ["id", "name", "slug", "type", "plan", "status", "members", "workspaces", "deleted", "created_at"],
      rows: rows.map((o) => [o.id, o.name, o.slug, o.type, o.subscription?.plan.name ?? "Free", o.subscription?.status ?? "none", o._count.memberships, o._count.workspaces, yn(!!o.deletedAt), iso(o.createdAt)]),
    };
  },
};

/* ----------------------------- Affiliates ----------------------------- */

export const affiliatesQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt"],
  filterKeys: ["applicationStatus", "status", ...DATE_FILTER_KEYS],
};

export function affiliatesWhere(query: AdminQuery): Prisma.AffiliateWhereInput {
  const where: Prisma.AffiliateWhereInput = {};
  const f = query.filters;
  if (f.applicationStatus) where.applicationStatus = f.applicationStatus;
  if (f.status) where.status = f.status;
  if (query.q) {
    where.OR = [
      { affiliateCode: { contains: query.q, mode: "insensitive" } },
      { user: { email: { contains: query.q, mode: "insensitive" } } },
      { user: { name: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  const created = dateRange(f);
  if (created) where.createdAt = created;
  return where;
}

export const affiliatesDataset: ExportDataset = {
  type: "affiliates",
  label: "Affiliates",
  queryOpts: affiliatesQueryOpts,
  async load(query, limit) {
    const rows = await db.affiliate.findMany({
      where: affiliatesWhere(query),
      orderBy: { createdAt: query.dir },
      take: limit,
      include: { user: { select: { email: true, name: true } } },
    });
    return {
      header: ["id", "code", "name", "email", "commission_type", "commission_rate", "currency", "application_status", "status", "created_at"],
      rows: rows.map((a) => [a.id, a.affiliateCode, a.user.name, a.user.email, a.commissionType, a.commissionRate, a.currency, a.applicationStatus, a.status, iso(a.createdAt)]),
    };
  },
};
