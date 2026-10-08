import { z } from "zod";
import { FESTIVAL_BY_ID } from "./catalog";
import { isValidTimezone, isYmd } from "./calendar";
import type { FestivalConfig } from "./types";

export const MAX_CUSTOM = 24;
export const MAX_IMPORT_BYTES = 40_000;

export const DEFAULT_FESTIVAL_CONFIG: FestivalConfig = {
  enabled: true,
  autoMode: false,
  timezone: "Asia/Kolkata",
  intensity: "medium",
  effects: { particles: true, greeting: true, glow: true, recolor: false },
  audience: { marketing: true, app: true, admin: false },
  manual: { festivalId: null, until: null },
  overrides: {},
  custom: [],
};

const dateStr = z.string().refine(isYmd, "Use a real date (YYYY-MM-DD)");
const knownTheme = z.string().refine((id) => id in FESTIVAL_BY_ID, "Unknown theme");
const day = z.number().int().min(0).max(30);

const overrideSchema = z.object({
  auto: z.boolean().optional(),
  before: day.optional(),
  after: day.optional(),
  message: z.string().trim().max(120).optional(),
  dateOverride: dateStr.optional(),
});

const customSchema = z
  .object({
    id: z.string().regex(/^custom-[a-z0-9-]{3,40}$/, "Bad custom festival id"),
    name: z.string().trim().min(2).max(40),
    themeId: knownTheme,
    startsOn: dateStr,
    endsOn: dateStr,
    yearly: z.boolean(),
    message: z.string().trim().max(120).optional(),
  })
  .refine((c) => c.endsOn >= c.startsOn, { message: "End date is before the start date", path: ["endsOn"] });

export const festivalConfigSchema = z
  .object({
    enabled: z.boolean(),
    autoMode: z.boolean(),
    timezone: z.string().refine(isValidTimezone, "Unknown time zone"),
    intensity: z.enum(["low", "medium", "high"]),
    effects: z.object({ particles: z.boolean(), greeting: z.boolean(), glow: z.boolean(), recolor: z.boolean() }),
    audience: z.object({ marketing: z.boolean(), app: z.boolean(), admin: z.boolean() }),
    manual: z.object({
      festivalId: z.string().nullable().refine((v) => v === null || v in FESTIVAL_BY_ID || v.startsWith("custom-"), "Unknown festival"),
      until: dateStr.nullable(),
    }),
    overrides: z.record(z.string().refine((id) => id in FESTIVAL_BY_ID, "Unknown festival"), overrideSchema),
    custom: z.array(customSchema).max(MAX_CUSTOM),
  })
  .refine((c) => new Set(c.custom.map((x) => x.id)).size === c.custom.length, { message: "Duplicate custom festival id", path: ["custom"] });

export type ParseResult = { ok: true; config: FestivalConfig } | { ok: false; errors: string[] };

/** Strict parse for saving and importing: any problem is reported, nothing is silently dropped. */
export function parseFestivalConfig(input: unknown): ParseResult {
  const merged = mergeDefaults(input);
  const res = festivalConfigSchema.safeParse(merged);
  if (res.success) return { ok: true, config: res.data as FestivalConfig };
  return { ok: false, errors: res.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "config"}: ${i.message}`) };
}

/**
 * Lenient read for rendering: a damaged or old settings row falls back to the
 * defaults instead of breaking the page or the public API.
 */
export function normalizeFestivalConfig(input: unknown): FestivalConfig {
  const strict = parseFestivalConfig(input);
  return strict.ok ? strict.config : DEFAULT_FESTIVAL_CONFIG;
}

/** Fills missing top-level and nested fields from the defaults (partial imports stay valid). */
function mergeDefaults(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const i = input as Record<string, unknown>;
  const d = DEFAULT_FESTIVAL_CONFIG;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  return {
    ...d,
    ...i,
    effects: { ...d.effects, ...obj(i.effects) },
    audience: { ...d.audience, ...obj(i.audience) },
    manual: { ...d.manual, ...obj(i.manual) },
    overrides: i.overrides === undefined ? d.overrides : i.overrides,
    custom: i.custom === undefined ? d.custom : i.custom,
  };
}

export const TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;
