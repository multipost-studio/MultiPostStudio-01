import { z } from "zod";

/**
 * Settings for the reviews module (Admin → Reviews → Settings). One JSON row in
 * SystemSetting, so no migration. Strict parse for saving/importing, lenient
 * normalize for rendering (a damaged row falls back to the defaults).
 */

export const MAX_IMPORT_BYTES = 120_000;
export const MAX_EXTERNAL_LINKS = 6;

const url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => /^https:\/\/[^\s]+$/i.test(v), "must be a full https:// address");

const externalLink = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1, "needs a name").max(40),
  url,
});

export const reviewConfigSchema = z.object({
  prompt: z.object({
    /** Master switch for the in-app "would you review us?" popup. */
    enabled: z.boolean(),
    /** Don't ask brand-new accounts: they haven't formed an opinion yet. */
    minAccountDays: z.number().int().min(0).max(365),
    /** Ask only people who have actually published something. */
    minPublishedPosts: z.number().int().min(0).max(1000),
    /** How long "Maybe later" stays quiet. */
    snoozeDays: z.number().int().min(1).max(365),
    /** Stop asking after this many popups. */
    maxAsks: z.number().int().min(1).max(10),
    /** Wait this long after the page opens before showing the popup. */
    delaySeconds: z.number().int().min(3).max(300),
    audience: z.enum(["all", "paid"]),
  }),
  display: z.object({
    /** Show the reviews band on the landing page (only ever when there are approved reviews). */
    landing: z.boolean(),
    landingCount: z.number().int().min(3).max(24),
    /** Publish the /reviews page. */
    page: z.boolean(),
    /** Publish new in-app reviews straight away instead of waiting in the queue. */
    autoApprove: z.boolean(),
  }),
  thanks: z.object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().max(300),
  }),
  /** Offered after someone rates 4 or 5 stars (G2, Capterra, Google…). Shown to every rating that leaves a public review. */
  externalLinks: z.array(externalLink).max(MAX_EXTERNAL_LINKS),
});

export type ReviewConfig = z.infer<typeof reviewConfigSchema>;

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  prompt: { enabled: true, minAccountDays: 7, minPublishedPosts: 3, snoozeDays: 14, maxAsks: 3, delaySeconds: 20, audience: "all" },
  display: { landing: true, landingCount: 12, page: true, autoApprove: false },
  thanks: { title: "Thank you!", body: "Your review helps other teams decide, and it helps us decide what to build next." },
  externalLinks: [],
};

export type ReviewConfigParse = { ok: true; config: ReviewConfig } | { ok: false; errors: string[] };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Fill anything the input leaves out from the defaults (one level deep). */
function withDefaults(input: unknown): unknown {
  if (!isObj(input)) return input;
  const d = DEFAULT_REVIEW_CONFIG as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...d };
  for (const key of Object.keys(d)) {
    const given = input[key];
    if (given === undefined) continue;
    out[key] = isObj(d[key]) && isObj(given) ? { ...(d[key] as object), ...given } : given;
  }
  return out;
}

export function parseReviewConfig(input: unknown): ReviewConfigParse {
  const res = reviewConfigSchema.safeParse(withDefaults(input));
  if (res.success) return { ok: true, config: res.data };
  return { ok: false, errors: res.error.issues.slice(0, 8).map((e) => `${e.path.join(".") || "settings"}: ${e.message}`) };
}

export function normalizeReviewConfig(input: unknown): ReviewConfig {
  const r = parseReviewConfig(input);
  return r.ok ? r.config : DEFAULT_REVIEW_CONFIG;
}

export function newLinkId(): string {
  return `ext-${Math.random().toString(36).slice(2, 8)}`;
}
