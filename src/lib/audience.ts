import { z } from "zod";
import { CHANNELS, sanitizeValue, canonicalSource, canonicalMedium } from "@/lib/attribution";
import { isSubscriptionEntitled } from "@/lib/entitlements-pure";

/**
 * Audiences: a filter over how users were acquired (UTM / channel, first or
 * last touch), when they signed up and which plan they are on. One definition
 * shared by the admin audience builder, CSV export, in-app broadcasts and
 * promo-card targeting.
 */

const list = (max: number) => z.array(z.string().max(80)).max(max).default([]);

export const segmentFilterSchema = z.object({
  channels: z.array(z.enum(CHANNELS)).max(CHANNELS.length).default([]),
  sources: list(30),
  mediums: list(30),
  campaigns: list(30),
  plans: z.array(z.string().regex(/^[a-z0-9_-]{1,40}$/i)).max(30).default([]),
  /** YYYY-MM-DD, inclusive. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => v ?? null),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => v ?? null),
  touch: z.enum(["first", "last"]).default("first"),
});

export type SegmentFilter = z.output<typeof segmentFilterSchema>;
export type SegmentFilterInput = z.input<typeof segmentFilterSchema>;

const cleanList = (v: string[], f: (s: unknown) => string | null) => [...new Set(v.map(f).filter((x): x is string => !!x))];

/** Parse + clean any stored/client filter. Never throws; garbage becomes the empty filter. */
export function normalizeSegmentFilter(raw: unknown): SegmentFilter {
  const r = segmentFilterSchema.safeParse(typeof raw === "string" ? safeJson(raw) : raw);
  const f = r.success ? r.data : segmentFilterSchema.parse({});
  return {
    ...f,
    sources: cleanList(f.sources, canonicalSource),
    mediums: cleanList(f.mediums, canonicalMedium),
    campaigns: cleanList(f.campaigns, (s) => sanitizeValue(s)),
    plans: [...new Set(f.plans.map((p) => p.toLowerCase()))],
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function isEmptyFilter(f: SegmentFilter): boolean {
  return !f.channels.length && !f.sources.length && !f.mediums.length && !f.campaigns.length && !f.plans.length && !f.from && !f.to;
}

/** Human summary for lists and confirmations, e.g. "Paid Search · source google · campaign spring_launch". */
export function describeFilter(f: SegmentFilter): string {
  const parts: string[] = [];
  if (f.channels.length) parts.push(f.channels.join(" / "));
  if (f.sources.length) parts.push(`source ${f.sources.join(", ")}`);
  if (f.mediums.length) parts.push(`medium ${f.mediums.join(", ")}`);
  if (f.campaigns.length) parts.push(`campaign ${f.campaigns.join(", ")}`);
  if (f.plans.length) parts.push(`plan ${f.plans.join(", ")}`);
  if (f.from || f.to) parts.push(`signed up ${f.from ?? "…"} to ${f.to ?? "now"}`);
  if (!parts.length) return "Everyone";
  return `${parts.join(" · ")}${f.touch === "last" ? " (last touch)" : ""}`;
}

type DbWhere = Record<string, unknown>;

/** Prisma `where` for the attribution and date parts. Plan is applied separately (see `matchesPlan`). */
export function segmentWhere(f: SegmentFilter): DbWhere {
  const last = f.touch === "last";
  const attr: DbWhere = {};
  if (f.channels.length) attr[last ? "lastChannel" : "channel"] = { in: f.channels };
  if (f.sources.length) attr[last ? "lastSource" : "source"] = { in: f.sources };
  if (f.mediums.length) attr[last ? "lastMedium" : "medium"] = { in: f.mediums };
  if (f.campaigns.length) attr[last ? "lastCampaign" : "campaign"] = { in: f.campaigns };

  const where: DbWhere = { deletedAt: null };
  if (Object.keys(attr).length) where.attribution = attr;
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: new Date(`${f.from}T00:00:00.000Z`) } : {}),
      ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999Z`) } : {}),
    };
  }
  return where;
}

type SubLike = {
  status: string;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  canceledAt?: Date | null;
  plan: { key: string; priceMonthly: number };
};

/**
 * The plan a user effectively has: the most expensive entitled subscription
 * across their organizations, otherwise "free". Matches how entitlements are
 * resolved everywhere else (isSubscriptionEntitled).
 */
export function effectivePlanKey(subs: (SubLike | null | undefined)[]): string {
  let best: SubLike | null = null;
  for (const s of subs) {
    if (!s || !isSubscriptionEntitled(s)) continue;
    if (!best || s.plan.priceMonthly > best.plan.priceMonthly) best = s;
  }
  return best?.plan.key ?? "free";
}

export const matchesPlan = (f: SegmentFilter, planKey: string) => f.plans.length === 0 || f.plans.includes(planKey);

// ---- promo-card targeting ---------------------------------------------------

export const audienceTargetSchema = z.object({
  channels: z.array(z.enum(CHANNELS)).max(CHANNELS.length).default([]),
  sources: list(30),
  campaigns: list(30),
});
export type AudienceTarget = z.output<typeof audienceTargetSchema>;

export function normalizeAudienceTarget(raw: unknown): AudienceTarget {
  const r = audienceTargetSchema.safeParse(typeof raw === "string" ? safeJson(raw) : raw);
  const t = r.success ? r.data : { channels: [], sources: [], campaigns: [] };
  return {
    channels: [...new Set(t.channels)],
    sources: cleanList(t.sources, canonicalSource),
    campaigns: cleanList(t.campaigns, (s) => sanitizeValue(s)),
  };
}

export const isEmptyTarget = (t: AudienceTarget) => !t.channels.length && !t.sources.length && !t.campaigns.length;

export type UserAcquisition = { channel: string; source: string | null; campaign: string | null } | null;

/**
 * Within a dimension any value matches; across dimensions all must. A user we
 * have no attribution for never matches a targeted card (we can't claim they
 * came from somewhere), but an untargeted card matches everyone.
 */
export function matchesAudience(target: AudienceTarget, who: UserAcquisition): boolean {
  if (isEmptyTarget(target)) return true;
  if (!who) return false;
  if (target.channels.length && !(target.channels as string[]).includes(who.channel)) return false;
  if (target.sources.length && (!who.source || !target.sources.includes(who.source))) return false;
  if (target.campaigns.length && (!who.campaign || !target.campaigns.includes(who.campaign))) return false;
  return true;
}
