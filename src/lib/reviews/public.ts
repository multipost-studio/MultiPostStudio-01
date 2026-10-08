import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { summarize, type PublicReview, type ReviewSummary } from "./model";

/**
 * Read side for the public site (landing band, /reviews, structured data). Everything
 * here swallows database errors and returns "no reviews": these run on marketing pages,
 * which must keep rendering if the table is missing (migration not applied yet) or the
 * database blinks.
 */

/** Approved, and an in-app review additionally needs its author's consent to be public. */
export const VISIBLE_WHERE: Prisma.ReviewWhereInput = {
  status: "approved",
  OR: [{ source: { not: "in_app" } }, { publicConsent: true }],
};

const ORDER = [{ featured: "desc" }, { sortOrder: "asc" }, { publishedAt: "desc" }, { createdAt: "desc" }] as const;

const EMPTY_SUMMARY: ReviewSummary = { count: 0, average: 0, distribution: [0, 0, 0, 0, 0] };

const SELECT = {
  id: true,
  authorName: true,
  authorRole: true,
  avatarUrl: true,
  rating: true,
  title: true,
  body: true,
  adminReply: true,
  featured: true,
  createdAt: true,
} as const;

type Row = {
  id: string;
  authorName: string;
  authorRole: string | null;
  avatarUrl: string | null;
  rating: number;
  title: string | null;
  body: string;
  adminReply: string | null;
  featured: boolean;
  createdAt: Date;
};

function toPublic(r: Row): PublicReview {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

export async function getPublicSummary(): Promise<ReviewSummary> {
  try {
    const rows = await db.review.findMany({ where: VISIBLE_WHERE, select: { rating: true }, take: 50_000 });
    return summarize(rows.map((r) => r.rating));
  } catch (err) {
    logger.warn({ err }, "review summary failed");
    return EMPTY_SUMMARY;
  }
}

export async function getPublicReviews(opts: { limit: number; skip?: number; rating?: number }): Promise<PublicReview[]> {
  try {
    const rows = await db.review.findMany({
      where: { ...VISIBLE_WHERE, ...(opts.rating ? { rating: opts.rating } : {}) },
      orderBy: [...ORDER],
      take: Math.max(1, Math.min(opts.limit, 100)),
      skip: Math.max(0, opts.skip ?? 0),
      select: SELECT,
    });
    return rows.map(toPublic);
  } catch (err) {
    logger.warn({ err }, "public reviews load failed");
    return [];
  }
}
