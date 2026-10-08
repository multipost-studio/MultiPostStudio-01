import { z } from "zod";

/** Pure review domain: statuses, validation, summary maths. No database here. */

export const REVIEW_STATUSES = ["pending", "approved", "rejected", "hidden"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_SOURCES = ["in_app", "manual", "import"] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export const LIMITS = { name: 60, role: 80, title: 80, body: 1500, reply: 600, note: 500, url: 300, minPublicBody: 10 } as const;

export type ReviewRecord = {
  id: string;
  userId: string | null;
  authorName: string;
  authorRole: string | null;
  avatarUrl: string | null;
  rating: number;
  title: string | null;
  body: string;
  status: ReviewStatus;
  featured: boolean;
  sortOrder: number;
  source: ReviewSource;
  sourceUrl: string | null;
  publicConsent: boolean;
  adminReply: string | null;
  adminNote: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** What the public site is allowed to see of a review. Dates are ISO strings so it can cross to client components. */
export type PublicReview = {
  id: string;
  authorName: string;
  authorRole: string | null;
  avatarUrl: string | null;
  rating: number;
  title: string | null;
  body: string;
  adminReply: string | null;
  featured: boolean;
  createdAt: string;
};

export type ReviewSummary = { count: number; average: number; distribution: [number, number, number, number, number] };

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `must be ${max} characters or fewer`)
    .optional()
    .transform((v) => (v ? v : null));

const optionalHttps = z
  .string()
  .trim()
  .max(LIMITS.url)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https:\/\/[^\s]+$/i.test(v), "must be a full https:// address");

const rating = z.number().int("must be a whole number").min(1, "must be 1 to 5").max(5, "must be 1 to 5");

/** What a signed-in user may submit about the product. */
export const userReviewSchema = z
  .object({
    rating,
    title: optional(LIMITS.title),
    body: z.string().trim().max(LIMITS.body, `must be ${LIMITS.body} characters or fewer`),
    displayName: z.string().trim().min(1, "Add the name to show").max(LIMITS.name),
    role: optional(LIMITS.role),
    publicConsent: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.publicConsent && v.body.length < LIMITS.minPublicBody) {
      ctx.addIssue({ code: "custom", path: ["body"], message: `Write at least ${LIMITS.minPublicBody} characters to publish it` });
    }
  });
export type UserReviewInput = z.infer<typeof userReviewSchema>;

/** What an admin may set when adding or editing a review. */
export const adminReviewSchema = z.object({
  authorName: z.string().trim().min(1, "needs a name").max(LIMITS.name),
  authorRole: optional(LIMITS.role),
  avatarUrl: optionalHttps,
  rating,
  title: optional(LIMITS.title),
  body: z.string().trim().max(LIMITS.body),
  status: z.enum(REVIEW_STATUSES),
  featured: z.boolean(),
  sortOrder: z.number().int().min(-1000).max(1000),
  sourceUrl: optionalHttps,
  adminReply: optional(LIMITS.reply),
  adminNote: optional(LIMITS.note),
});
export type AdminReviewInput = z.infer<typeof adminReviewSchema>;

export function issuesOf(error: z.ZodError, limit = 8): string[] {
  return error.issues.slice(0, limit).map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
}

export function summarize(ratings: readonly number[]): ReviewSummary {
  const distribution: ReviewSummary["distribution"] = [0, 0, 0, 0, 0];
  let total = 0;
  let count = 0;
  for (const r of ratings) {
    if (!Number.isInteger(r) || r < 1 || r > 5) continue;
    distribution[5 - r] += 1;
    total += r;
    count += 1;
  }
  return { count, average: count ? Math.round((total / count) * 10) / 10 : 0, distribution };
}

/** A review can be shown publicly only when approved, and an in-app one only with the author's consent. */
export function isPubliclyVisible(r: Pick<ReviewRecord, "status" | "source" | "publicConsent">): boolean {
  return r.status === "approved" && (r.source !== "in_app" || r.publicConsent);
}

/** Initials for an avatar fallback: "Maya Chen" → "MC". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Fingerprint used to skip a review that is already there (same person, rating and opening words). */
export function reviewFingerprint(r: { authorName: string; rating: number; body: string }): string {
  return `${r.authorName.trim().toLowerCase()}|${r.rating}|${r.body.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60)}`;
}
