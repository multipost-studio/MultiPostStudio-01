import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { REVIEW_SOURCES, REVIEW_STATUSES, reviewFingerprint, summarize, type ReviewRecord, type ReviewSource, type ReviewStatus, type ReviewSummary, type UserReviewInput } from "./model";
import type { ImportedReview } from "./transfer";
import { VISIBLE_WHERE } from "./public";

/** Database access for the admin module and the signed-in user's own review. */

export const ADMIN_PAGE_SIZE = 25;

function asRecord(r: Record<string, unknown>): ReviewRecord {
  const status = (REVIEW_STATUSES as readonly string[]).includes(r.status as string) ? (r.status as ReviewStatus) : "pending";
  const source = (REVIEW_SOURCES as readonly string[]).includes(r.source as string) ? (r.source as ReviewSource) : "manual";
  return { ...(r as unknown as ReviewRecord), status, source };
}

export type AdminFilters = {
  status?: ReviewStatus | "all";
  rating?: number;
  source?: ReviewSource | "all";
  /** Only in-app reviews whose author did not agree to publish: the private feedback inbox. */
  privateOnly?: boolean;
  featured?: boolean;
  q?: string;
  page?: number;
};

export function adminWhere(f: AdminFilters): Prisma.ReviewWhereInput {
  const and: Prisma.ReviewWhereInput[] = [];
  if (f.status && f.status !== "all") and.push({ status: f.status });
  if (f.rating && f.rating >= 1 && f.rating <= 5) and.push({ rating: f.rating });
  if (f.source && f.source !== "all") and.push({ source: f.source });
  if (f.privateOnly) and.push({ source: "in_app", publicConsent: false });
  if (f.featured) and.push({ featured: true });
  const q = f.q?.trim();
  if (q) and.push({ OR: [{ authorName: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { authorRole: { contains: q, mode: "insensitive" } }] });
  return and.length ? { AND: and } : {};
}

export async function listReviews(f: AdminFilters): Promise<{ rows: ReviewRecord[]; total: number; page: number; pages: number }> {
  const where = adminWhere(f);
  const total = await db.review.count({ where });
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(f.page ?? 1)), pages);
  const rows = await db.review.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * ADMIN_PAGE_SIZE, take: ADMIN_PAGE_SIZE });
  return { rows: rows.map((r) => asRecord(r as unknown as Record<string, unknown>)), total, page, pages };
}

/** Every review matching the filters (for export), capped. */
export async function exportableReviews(f: AdminFilters, cap = 5000): Promise<ReviewRecord[]> {
  const rows = await db.review.findMany({ where: adminWhere(f), orderBy: [{ createdAt: "desc" }], take: cap });
  return rows.map((r) => asRecord(r as unknown as Record<string, unknown>));
}

export type ReviewStats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  hidden: number;
  privateFeedback: number;
  last30Days: number;
  /** Rating spread of everything the public can see. */
  published: ReviewSummary;
  /** Rating spread of every review, whatever its status. */
  overall: ReviewSummary;
};

export async function getReviewStats(): Promise<ReviewStats> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [total, pending, approved, rejected, hidden, privateFeedback, last30Days, visible, all] = await Promise.all([
    db.review.count(),
    db.review.count({ where: { status: "pending" } }),
    db.review.count({ where: { status: "approved" } }),
    db.review.count({ where: { status: "rejected" } }),
    db.review.count({ where: { status: "hidden" } }),
    db.review.count({ where: { source: "in_app", publicConsent: false } }),
    db.review.count({ where: { createdAt: { gte: since } } }),
    db.review.findMany({ where: VISIBLE_WHERE, select: { rating: true }, take: 50_000 }),
    db.review.findMany({ select: { rating: true }, take: 50_000 }),
  ]);
  return {
    total,
    pending,
    approved,
    rejected,
    hidden,
    privateFeedback,
    last30Days,
    published: summarize(visible.map((r) => r.rating)),
    overall: summarize(all.map((r) => r.rating)),
  };
}

/** Fingerprints of every stored review, so an import can skip what is already there. */
export async function existingFingerprints(): Promise<Set<string>> {
  const rows = await db.review.findMany({ select: { authorName: true, rating: true, body: true }, take: 20_000 });
  return new Set(rows.map(reviewFingerprint));
}

export async function createImported(reviews: ImportedReview[], actorId: string): Promise<number> {
  const now = new Date();
  const res = await db.review.createMany({
    data: reviews.map((r) => ({
      authorName: r.authorName,
      authorRole: r.authorRole,
      avatarUrl: r.avatarUrl,
      rating: r.rating,
      title: r.title,
      body: r.body,
      status: r.status,
      featured: r.featured,
      sortOrder: r.sortOrder,
      source: r.source,
      sourceUrl: r.sourceUrl,
      adminReply: r.adminReply,
      adminNote: r.adminNote,
      // The admin importing a review is vouching that it may be shown.
      publicConsent: true,
      reviewedBy: actorId,
      publishedAt: r.status === "approved" ? now : null,
      createdAt: r.createdAt ?? now,
    })),
  });
  return res.count;
}

/* ───────────── the signed-in user's own review ───────────── */

export async function getMyReview(userId: string): Promise<ReviewRecord | null> {
  const row = await db.review.findUnique({ where: { userId } });
  return row ? asRecord(row as unknown as Record<string, unknown>) : null;
}

/**
 * Create or update the user's one review. An in-app review is held for moderation
 * unless auto-approve is on, and a review that was already published goes back to the
 * queue when its author rewrites it. Without consent to publish it stays private.
 */
export async function saveMyReview(args: { userId: string; orgId: string | null; input: UserReviewInput; autoApprove: boolean }): Promise<ReviewRecord> {
  const { userId, orgId, input, autoApprove } = args;
  const status: ReviewStatus = !input.publicConsent ? "hidden" : autoApprove ? "approved" : "pending";
  const now = new Date();
  const data = {
    orgId,
    authorName: input.displayName,
    authorRole: input.role,
    rating: input.rating,
    title: input.title,
    body: input.body,
    publicConsent: input.publicConsent,
    status,
    publishedAt: status === "approved" ? now : null,
  };
  const row = await db.review.upsert({
    where: { userId },
    create: { userId, source: "in_app", ...data },
    update: data,
  });
  return asRecord(row as unknown as Record<string, unknown>);
}

export async function deleteMyReview(userId: string): Promise<void> {
  await db.review.deleteMany({ where: { userId } });
}

/* ───────────── the popup ───────────── */

export async function getPromptState(userId: string) {
  return db.reviewPrompt.findUnique({ where: { userId } });
}

export async function recordPromptShown(userId: string): Promise<void> {
  const now = new Date();
  await db.reviewPrompt.upsert({
    where: { userId },
    create: { userId, askCount: 1, lastAskedAt: now },
    update: { askCount: { increment: 1 }, lastAskedAt: now },
  });
}

export async function setPromptStatus(userId: string, patch: { status?: "active" | "reviewed" | "declined"; snoozeUntil?: Date | null }): Promise<void> {
  await db.reviewPrompt.upsert({
    where: { userId },
    create: { userId, status: patch.status ?? "active", snoozeUntil: patch.snoozeUntil ?? null },
    update: { ...(patch.status ? { status: patch.status } : {}), ...(patch.snoozeUntil !== undefined ? { snoozeUntil: patch.snoozeUntil } : {}) },
  });
}

export async function countPublishedPosts(userId: string): Promise<number> {
  return db.post.count({ where: { authorId: userId, status: "published" } });
}
