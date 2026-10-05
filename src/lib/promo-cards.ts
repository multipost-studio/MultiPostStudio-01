import { z } from "zod";

/**
 * Admin-managed promotional cards. Pure module (no DB, no server imports) so
 * the admin form, the sidebar and the server actions share one definition of
 * validation, status and "who sees what".
 */

export const PROMO_PLACEMENTS = ["sidebar", "dashboard"] as const;
export const PROMO_TONES = ["brand", "accent", "neutral"] as const;
export const PROMO_ICONS = [
  "Sparkles",
  "Rocket",
  "Zap",
  "Gift",
  "Megaphone",
  "Plug",
  "TrendingUp",
  "Crown",
  "Bell",
  "Star",
  "Users",
  "BarChart3",
  "Share2",
  "Handshake",
  "Flame",
  "PartyPopper",
] as const;

export type PromoPlacement = (typeof PROMO_PLACEMENTS)[number];
export type PromoTone = (typeof PROMO_TONES)[number];
export type PromoStatus = "live" | "scheduled" | "expired" | "paused" | "archived";

/** What the client renders. Plain fields only so it crosses the RSC boundary. */
export type PromoCardData = {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  icon: string | null;
  imageUrl: string | null;
  tone: PromoTone;
  dismissible: boolean;
};

/** Relative app path, or https. Blocks javascript:/data: and protocol-relative `//host`. */
export function isSafeCtaUrl(u: string): boolean {
  if (u.startsWith("/")) return !u.startsWith("//") && !u.includes("\\");
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

export function isSafeImageUrl(u: string): boolean {
  if (u.startsWith("/uploads/")) return !u.includes("..");
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });

export const promoCardSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(60, "Title must be 60 characters or fewer"),
    description: z.string().trim().min(1, "Description is required").max(160, "Description must be 160 characters or fewer"),
    ctaText: z.string().trim().min(1, "Button text is required").max(24, "Button text must be 24 characters or fewer"),
    ctaUrl: z.string().trim().max(500).refine(isSafeCtaUrl, "Use an in-app path like /settings/billing or an https:// link"),
    icon: z
      .string()
      .nullish()
      .refine((v) => !v || (PROMO_ICONS as readonly string[]).includes(v), "Unknown icon")
      .transform((v) => v ?? null),
    imageUrl: z
      .string()
      .trim()
      .max(500)
      .refine(isSafeImageUrl, "Image must be an uploaded file")
      .nullish()
      .transform((v) => v || null),
    tone: z.enum(PROMO_TONES).default("brand"),
    placement: z.enum(PROMO_PLACEMENTS).default("sidebar"),
    priority: z.number().int().min(-1000).max(1000).default(0),
    enabled: z.boolean().default(false),
    dismissible: z.boolean().default(true),
    startsAt: optionalDate,
    endsAt: optionalDate,
    targetPlans: z
      .array(z.string().regex(/^[a-z0-9_-]{1,40}$/i))
      .max(30)
      .default([])
      .transform((a) => [...new Set(a)]),
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, {
    path: ["endsAt"],
    message: "End date must be after the start date",
  });

export type PromoCardInput = z.input<typeof promoCardSchema>;
export type PromoCardValues = z.output<typeof promoCardSchema>;

type StatusFields = { enabled: boolean; archivedAt: Date | null; startsAt: Date | null; endsAt: Date | null };

export function promoStatus(c: StatusFields, now: Date = new Date()): PromoStatus {
  if (c.archivedAt) return "archived";
  if (!c.enabled) return "paused";
  if (c.startsAt && c.startsAt > now) return "scheduled";
  if (c.endsAt && c.endsAt <= now) return "expired";
  return "live";
}

export function parseTargetPlans(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

type SelectableCard = StatusFields &
  PromoCardData & { placement: string; priority: number; createdAt: Date; targetPlans: string };

/** Sidebar rotates a few cards; the dashboard shows a single banner. */
export const PLACEMENT_LIMIT: Record<PromoPlacement, number> = { sidebar: 5, dashboard: 1 };

/**
 * The single place that decides which cards a user sees: live, right
 * placement, plan matches (empty target = everyone), not dismissed (only
 * dismissible cards can be dismissed), highest priority first.
 */
export function selectVisiblePromoCards<T extends SelectableCard>(
  cards: T[],
  opts: { now?: Date; placement: PromoPlacement; planKey: string | null; dismissedIds: ReadonlySet<string> },
): T[] {
  const now = opts.now ?? new Date();
  return cards
    .filter((c) => {
      if (c.placement !== opts.placement) return false;
      if (promoStatus(c, now) !== "live") return false;
      const plans = parseTargetPlans(c.targetPlans);
      if (plans.length > 0 && (!opts.planKey || !plans.includes(opts.planKey))) return false;
      if (c.dismissible && opts.dismissedIds.has(c.id)) return false;
      return true;
    })
    .sort((a, b) => b.priority - a.priority || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, PLACEMENT_LIMIT[opts.placement]);
}

export function toPromoCardData(c: PromoCardData): PromoCardData {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    ctaText: c.ctaText,
    ctaUrl: c.ctaUrl,
    icon: c.icon,
    imageUrl: c.imageUrl,
    tone: c.tone,
    dismissible: c.dismissible,
  };
}
