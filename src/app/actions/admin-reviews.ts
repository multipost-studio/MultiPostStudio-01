"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { adminReviewSchema, issuesOf, REVIEW_SOURCES, REVIEW_STATUSES, reviewFingerprint, type ReviewStatus } from "@/lib/reviews/model";
import { DEFAULT_REVIEW_CONFIG, MAX_IMPORT_BYTES, parseReviewConfig, type ReviewConfig } from "@/lib/reviews/config";
import { loadReviewConfig, REVIEW_CONFIG_KEY, resetReviewConfig, saveReviewConfig } from "@/lib/reviews/store";
import { createImported, exportableReviews, existingFingerprints, type AdminFilters } from "@/lib/reviews/repo";
import { parseReviewImport, reviewsToCsv, reviewsToJson } from "@/lib/reviews/transfer";

/** Admin → Reviews. Every action is admin-only, validated, rate limited where it writes in bulk, and audited. */

function isRedirect(err: unknown): boolean {
  return typeof err === "object" && err !== null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}

function refresh() {
  // The landing band and /reviews both read approved reviews.
  revalidatePath("/");
  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
}

const FAIL = (e: string[]) => ({ ok: false as const, errors: e });
type Plain = { ok: true; message: string } | { ok: false; errors: string[] };

async function guard(actorId: string, bucket: string, limit: number): Promise<string | null> {
  try {
    await enforceRateLimit(`${bucket}:${actorId}`, limit, 60 * 60_000);
    return null;
  } catch (err) {
    if (err instanceof RateLimitError) return "Too many requests. Please wait a bit and try again.";
    throw err;
  }
}

/* ───────────── single review ───────────── */

/** Save every field of one review. */
export async function updateReviewAction(id: string, input: unknown): Promise<Plain> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const parsed = adminReviewSchema.safeParse(input);
    if (!parsed.success) return FAIL(issuesOf(parsed.error));
    const before = await db.review.findUnique({ where: { id }, select: { status: true, publishedAt: true, source: true, publicConsent: true } });
    if (!before) return FAIL(["That review no longer exists."]);
    if (parsed.data.status === "approved" && before.source === "in_app" && !before.publicConsent) {
      return FAIL(["The author didn't agree to publish this review, so it can't be made public."]);
    }
    if (parsed.data.status === "approved" && parsed.data.body.length === 0) return FAIL(["Add some text before publishing a review."]);
    await db.review.update({
      where: { id },
      data: {
        ...parsed.data,
        reviewedBy: admin.id,
        publishedAt: parsed.data.status === "approved" ? (before.publishedAt ?? new Date()) : before.publishedAt,
      },
    });
    await logAudit({ actorId: admin.id, action: "admin.review_updated", targetType: "review", targetId: id, metadata: { from: before.status, to: parsed.data.status } });
    refresh();
    return { ok: true, message: "Review saved" };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "update review failed");
    return FAIL(["Couldn't save the review."]);
  }
}

/** Add a review by hand (for example one a customer sent by email). */
export async function createReviewAction(input: unknown): Promise<Plain> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const limited = await guard(admin.id, "review-admin-write", 120);
    if (limited) return FAIL([limited]);
    const parsed = adminReviewSchema.safeParse(input);
    if (!parsed.success) return FAIL(issuesOf(parsed.error));
    if (parsed.data.status === "approved" && parsed.data.body.length === 0) return FAIL(["Add some text before publishing a review."]);
    const row = await db.review.create({
      data: { ...parsed.data, source: "manual", publicConsent: true, reviewedBy: admin.id, publishedAt: parsed.data.status === "approved" ? new Date() : null },
      select: { id: true },
    });
    await logAudit({ actorId: admin.id, action: "admin.review_created", targetType: "review", targetId: row.id, metadata: { status: parsed.data.status } });
    refresh();
    return { ok: true, message: "Review added" };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "create review failed");
    return FAIL(["Couldn't add the review."]);
  }
}

/* ───────────── bulk ───────────── */

const bulkSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1, "Select at least one review").max(100, "Select at most 100 reviews at a time"),
  op: z.enum(["approve", "reject", "hide", "pending", "feature", "unfeature", "delete"]),
});
export type BulkOp = z.infer<typeof bulkSchema>["op"];

const STATUS_OF: Partial<Record<BulkOp, ReviewStatus>> = { approve: "approved", reject: "rejected", hide: "hidden", pending: "pending" };

export async function bulkReviewAction(input: unknown): Promise<Plain> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const limited = await guard(admin.id, "review-admin-write", 120);
    if (limited) return FAIL([limited]);
    const parsed = bulkSchema.safeParse(input);
    if (!parsed.success) return FAIL(issuesOf(parsed.error));
    const { ids, op } = parsed.data;
    const where = { id: { in: ids } };
    let count = 0;
    if (op === "delete") {
      count = (await db.review.deleteMany({ where })).count;
    } else if (op === "feature" || op === "unfeature") {
      count = (await db.review.updateMany({ where, data: { featured: op === "feature", reviewedBy: admin.id } })).count;
    } else {
      const status = STATUS_OF[op]!;
      if (status === "approved") {
        // Publish only what is allowed to be public and has something to show.
        const ok = await db.review.findMany({
          where: { ...where, body: { not: "" }, OR: [{ source: { not: "in_app" } }, { publicConsent: true }] },
          select: { id: true, publishedAt: true },
        });
        const now = new Date();
        const fresh = ok.filter((r) => !r.publishedAt).map((r) => r.id);
        if (fresh.length) await db.review.updateMany({ where: { id: { in: fresh } }, data: { publishedAt: now } });
        count = (await db.review.updateMany({ where: { id: { in: ok.map((r) => r.id) } }, data: { status, reviewedBy: admin.id } })).count;
      } else {
        count = (await db.review.updateMany({ where, data: { status, reviewedBy: admin.id } })).count;
      }
    }
    await logAudit({ actorId: admin.id, action: `admin.review_bulk_${op}`, targetType: "review", targetId: ids[0], metadata: { requested: ids.length, changed: count } });
    refresh();
    const skipped = ids.length - count;
    const verb = { approve: "published", reject: "rejected", hide: "hidden", pending: "moved back to pending", feature: "featured", unfeature: "unfeatured", delete: "deleted" }[op];
    return { ok: true, message: `${count} review${count === 1 ? "" : "s"} ${verb}${skipped > 0 && op === "approve" ? `, ${skipped} skipped (no text, or the author didn't agree to publish)` : ""}` };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "bulk review action failed");
    return FAIL(["Couldn't apply that to the selected reviews."]);
  }
}

/* ───────────── export / import ───────────── */

const filterSchema = z.object({
  status: z.enum(["all", ...REVIEW_STATUSES]).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  source: z.enum(["all", ...REVIEW_SOURCES]).optional(),
  privateOnly: z.boolean().optional(),
  featured: z.boolean().optional(),
  q: z.string().max(100).optional(),
});

export async function exportReviewsAction(format: "csv" | "json", filters: unknown): Promise<{ ok: true; filename: string; mime: string; text: string; count: number } | { ok: false; errors: string[] }> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const limited = await guard(admin.id, "review-export", 30);
    if (limited) return FAIL([limited]);
    const f = filterSchema.safeParse(filters ?? {});
    const rows = await exportableReviews(f.success ? (f.data as AdminFilters) : {});
    await logAudit({ actorId: admin.id, action: "admin.reviews_exported", targetType: "review", targetId: "export", metadata: { format, count: rows.length } });
    const stamp = new Date().toISOString().slice(0, 10);
    return format === "csv"
      ? { ok: true, filename: `reviews-${stamp}.csv`, mime: "text/csv", text: reviewsToCsv(rows), count: rows.length }
      : { ok: true, filename: `reviews-${stamp}.json`, mime: "application/json", text: reviewsToJson(rows), count: rows.length };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "export reviews failed");
    return FAIL(["Couldn't export the reviews."]);
  }
}

export type ImportResult = { ok: true; message: string; added: number; skipped: number } | { ok: false; errors: string[] };

/** All-or-nothing: one bad row stops the import and names the row. Reviews already here are skipped, not duplicated. */
export async function importReviewsAction(text: string): Promise<ImportResult> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const limited = await guard(admin.id, "review-import", 10);
    if (limited) return FAIL([limited]);
    const parsed = parseReviewImport(text);
    if (!parsed.ok) return parsed;
    const have = await existingFingerprints();
    const fresh = parsed.reviews.filter((r) => !have.has(reviewFingerprint(r)));
    const added = fresh.length ? await createImported(fresh, admin.id) : 0;
    const skipped = parsed.reviews.length - fresh.length + parsed.duplicatesInFile;
    await logAudit({ actorId: admin.id, action: "admin.reviews_imported", targetType: "review", targetId: "import", metadata: { added, skipped } });
    refresh();
    return { ok: true, added, skipped, message: `${added} review${added === 1 ? "" : "s"} imported${skipped ? `, ${skipped} skipped as duplicates` : ""}` };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "import reviews failed");
    return FAIL(["Couldn't import the reviews."]);
  }
}

/* ───────────── settings ───────────── */

export type ConfigResult = { ok: true; config: ReviewConfig; message: string } | { ok: false; errors: string[] };

async function applyConfig(config: ReviewConfig, actorId: string, action: string, message: string): Promise<ConfigResult> {
  const before = await loadReviewConfig();
  await saveReviewConfig(config, actorId);
  await logAudit({ actorId, action, targetType: "system", targetId: REVIEW_CONFIG_KEY, metadata: { before, after: config } });
  refresh();
  return { ok: true, config, message };
}

export async function saveReviewConfigAction(input: unknown): Promise<ConfigResult> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const parsed = parseReviewConfig(input);
    if (!parsed.ok) return parsed;
    return await applyConfig(parsed.config, admin.id, "admin.review_config_updated", "Settings saved");
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "save review config failed");
    return FAIL(["Couldn't save the settings."]);
  }
}

export async function importReviewConfigAction(text: string): Promise<ConfigResult> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    if (typeof text !== "string" || text.length === 0) return FAIL(["The file is empty."]);
    if (text.length > MAX_IMPORT_BYTES) return FAIL([`The file is larger than ${MAX_IMPORT_BYTES / 1000} KB.`]);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return FAIL(["The file is not valid JSON."]);
    }
    const candidate = raw && typeof raw === "object" && "config" in raw && !("prompt" in raw) ? (raw as { config: unknown }).config : raw;
    const parsed = parseReviewConfig(candidate);
    if (!parsed.ok) return parsed;
    return await applyConfig(parsed.config, admin.id, "admin.review_config_imported", "Settings imported");
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "import review config failed");
    return FAIL(["Couldn't import the settings."]);
  }
}

export async function resetReviewConfigAction(): Promise<ConfigResult> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const before = await loadReviewConfig();
    await resetReviewConfig(admin.id);
    await logAudit({ actorId: admin.id, action: "admin.review_config_reset", targetType: "system", targetId: REVIEW_CONFIG_KEY, metadata: { before } });
    refresh();
    return { ok: true, config: DEFAULT_REVIEW_CONFIG, message: "Settings reset to the defaults" };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "reset review config failed");
    return FAIL(["Couldn't reset the settings."]);
  }
}
