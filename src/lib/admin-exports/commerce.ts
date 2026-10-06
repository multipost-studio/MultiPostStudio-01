import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DATE_FILTER_KEYS, dateRange, type AdminQuery, type AdminQueryOpts } from "@/lib/admin-query";
import { toMajor } from "@/lib/revenue";
import { iso, yn, type ExportDataset } from "./types";

/* ------------------------------- Invoices ------------------------------- */

export const invoicesQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt"],
  filterKeys: ["status", "currency", ...DATE_FILTER_KEYS],
};

export function invoicesWhere(query: AdminQuery): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {};
  const f = query.filters;
  if (f.status) where.status = f.status;
  if (f.currency) where.currency = { equals: f.currency, mode: "insensitive" };
  if (query.q) {
    where.OR = [
      { number: { contains: query.q, mode: "insensitive" } },
      { org: { name: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  const created = dateRange(f);
  if (created) where.createdAt = created;
  return where;
}

export const invoicesDataset: ExportDataset = {
  type: "invoices",
  label: "Invoices",
  queryOpts: invoicesQueryOpts,
  async load(query, limit) {
    const rows = await db.invoice.findMany({
      where: invoicesWhere(query),
      orderBy: { createdAt: query.dir },
      take: limit,
      include: { org: { select: { name: true, slug: true } } },
    });
    return {
      header: ["number", "organization", "org_slug", "status", "currency", "amount", "amount_minor_units", "period_start", "period_end", "created_at"],
      rows: rows.map((i) => [i.number, i.org.name, i.org.slug, i.status, i.currency.toUpperCase(), toMajor(i.amountDue, i.currency), i.amountDue, iso(i.periodStart), iso(i.periodEnd), iso(i.createdAt)]),
    };
  },
};

/* ----------------------------- Subscriptions ----------------------------- */

export const subscriptionsQueryOpts: AdminQueryOpts = {
  defaultSort: "createdAt",
  sortable: ["createdAt"],
  filterKeys: ["status", "provider", "interval", ...DATE_FILTER_KEYS],
};

export function subscriptionsWhere(query: AdminQuery): Prisma.SubscriptionWhereInput {
  const where: Prisma.SubscriptionWhereInput = {};
  const f = query.filters;
  if (f.status) where.status = f.status;
  if (f.provider) where.provider = f.provider;
  if (f.interval) where.interval = f.interval;
  if (query.q) {
    where.OR = [
      { org: { name: { contains: query.q, mode: "insensitive" } } },
      { plan: { name: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  const created = dateRange(f);
  if (created) where.createdAt = created;
  return where;
}

export const subscriptionsDataset: ExportDataset = {
  type: "subscriptions",
  label: "Subscriptions",
  queryOpts: subscriptionsQueryOpts,
  async load(query, limit) {
    const rows = await db.subscription.findMany({
      where: subscriptionsWhere(query),
      orderBy: { createdAt: query.dir },
      take: limit,
      include: { org: { select: { name: true, slug: true } }, plan: { select: { key: true, name: true } } },
    });
    return {
      header: ["organization", "org_slug", "plan_key", "plan", "status", "interval", "provider", "discount_pct", "coupon", "current_period_end", "trial_ends_at", "canceled_at", "created_at"],
      rows: rows.map((s) => [s.org.name, s.org.slug, s.plan.key, s.plan.name, s.status, s.interval, s.provider, s.discountPct, s.couponCode ?? "", iso(s.currentPeriodEnd), iso(s.trialEndsAt), iso(s.canceledAt), iso(s.createdAt)]),
    };
  },
};

/* --------------------------------- Plans --------------------------------- */

export const plansQueryOpts: AdminQueryOpts = { defaultSort: "sortIndex", sortable: ["sortIndex"], filterKeys: ["visibility"] };

export function plansWhere(query: AdminQuery): Prisma.PlanWhereInput {
  const where: Prisma.PlanWhereInput = {};
  if (query.filters.visibility === "public") where.isPublic = true;
  if (query.filters.visibility === "hidden") where.isPublic = false;
  if (query.q) where.OR = [{ key: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }];
  return where;
}

export const plansDataset: ExportDataset = {
  type: "plans",
  label: "Plans",
  queryOpts: plansQueryOpts,
  async load(query, limit) {
    const rows = await db.plan.findMany({ where: plansWhere(query), orderBy: { sortIndex: "asc" }, take: limit, include: { _count: { select: { subscriptions: true } } } });
    return {
      header: ["key", "name", "currency", "price_monthly_minor", "price_annual_minor", "price_monthly_inr_minor", "price_annual_inr_minor", "trial_days", "max_channels", "max_workspaces", "max_users", "max_scheduled", "ai_credits", "storage_mb", "analytics_retention_days", "api_rate_limit", "automation_limit", "public", "custom", "subscriptions", "entitlements_json", "features_json"],
      rows: rows.map((p) => [p.key, p.name, p.currency, p.priceMonthly, p.priceAnnual, p.priceMonthlyInr, p.priceAnnualInr, p.trialDays, p.maxChannels, p.maxWorkspaces, p.maxUsers, p.maxScheduled, p.aiCredits, p.storageMb, p.analyticsRetentionDays, p.apiRateLimit, p.automationLimit, yn(p.isPublic), yn(p.isCustom), p._count.subscriptions, p.entitlements, p.features]),
    };
  },
};

/* --------------------------------- Usage --------------------------------- */

export const usageQueryOpts: AdminQueryOpts = { defaultSort: "periodMonth", sortable: ["periodMonth"], filterKeys: ["month", "metric"] };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function usageWhere(query: AdminQuery): Prisma.UsageRecordWhereInput {
  const where: Prisma.UsageRecordWhereInput = {};
  const month = query.filters.month;
  where.periodMonth = month && MONTH_RE.test(month) ? month : new Date().toISOString().slice(0, 7);
  if (query.filters.metric) where.metric = query.filters.metric;
  if (query.q) where.org = { name: { contains: query.q, mode: "insensitive" } };
  return where;
}

export const usageDataset: ExportDataset = {
  type: "usage",
  label: "Usage",
  queryOpts: usageQueryOpts,
  async load(query, limit) {
    const rows = await db.usageRecord.findMany({
      where: usageWhere(query),
      orderBy: [{ metric: "asc" }, { value: "desc" }],
      take: limit,
      select: { metric: true, value: true, periodMonth: true, updatedAt: true, org: { select: { name: true, slug: true } } },
    });
    return {
      header: ["period_month", "organization", "org_slug", "metric", "value", "updated_at"],
      rows: rows.map((u) => [u.periodMonth, u.org.name, u.org.slug, u.metric, u.value, iso(u.updatedAt)]),
    };
  },
};
