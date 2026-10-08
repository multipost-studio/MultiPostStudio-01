import { parseCsv, toCsv } from "@/lib/csv";
import { adminReviewSchema, issuesOf, REVIEW_SOURCES, reviewFingerprint, type AdminReviewInput, type ReviewRecord, type ReviewSource } from "./model";

/**
 * Export and import of reviews. Strict and all-or-nothing: either every row is valid or
 * nothing is applied, and each problem names its row so it can be fixed in the file.
 */

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 600_000;

const COLUMNS = ["authorName", "authorRole", "rating", "title", "body", "status", "featured", "sortOrder", "source", "sourceUrl", "avatarUrl", "adminReply", "createdAt"] as const;

type ExportRow = Pick<ReviewRecord, "authorName" | "authorRole" | "rating" | "title" | "body" | "status" | "featured" | "sortOrder" | "source" | "sourceUrl" | "avatarUrl" | "adminReply" | "createdAt">;

export function reviewsToCsv(rows: readonly ExportRow[]): string {
  return toCsv([
    [...COLUMNS],
    ...rows.map((r) => [r.authorName, r.authorRole, r.rating, r.title, r.body, r.status, r.featured, r.sortOrder, r.source, r.sourceUrl, r.avatarUrl, r.adminReply, r.createdAt]),
  ]);
}

export function reviewsToJson(rows: readonly ExportRow[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      reviews: rows.map((r) => ({
        authorName: r.authorName,
        authorRole: r.authorRole,
        rating: r.rating,
        title: r.title,
        body: r.body,
        status: r.status,
        featured: r.featured,
        sortOrder: r.sortOrder,
        source: r.source,
        sourceUrl: r.sourceUrl,
        avatarUrl: r.avatarUrl,
        adminReply: r.adminReply,
        createdAt: r.createdAt.toISOString(),
      })),
    },
    null,
    2,
  );
}

export type ImportedReview = AdminReviewInput & { source: ReviewSource; createdAt: Date | null };
export type ImportParse = { ok: true; reviews: ImportedReview[]; duplicatesInFile: number } | { ok: false; errors: string[] };

const TRUE = new Set(["yes", "true", "1", "y"]);
const FALSE = new Set(["no", "false", "0", "n", ""]);

function toBool(v: unknown): boolean | "invalid" {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (TRUE.has(s)) return true;
  if (FALSE.has(s)) return false;
  return "invalid";
}

function toNum(v: unknown): number | "invalid" {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : "invalid";
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

/** Turn one loosely-typed row into a validated review, or the reasons it can't be. */
function parseRow(raw: Record<string, unknown>): { ok: true; review: ImportedReview } | { ok: false; errors: string[] } {
  const problems: string[] = [];
  const featured = toBool(raw.featured);
  if (featured === "invalid") problems.push("featured: use yes or no");
  const sortOrder = toNum(raw.sortOrder);
  if (sortOrder === "invalid") problems.push("sortOrder: must be a number");
  const ratingNum = typeof raw.rating === "number" ? raw.rating : Number(String(raw.rating ?? "").trim());
  const source = (str(raw.source) ?? "import").trim().toLowerCase() || "import";
  // A file can only bring reviews in as manual/import: "in_app" belongs to reviews written by signed-in users.
  const safeSource: ReviewSource = (REVIEW_SOURCES as readonly string[]).includes(source) && source !== "in_app" ? (source as ReviewSource) : "import";
  const status = (str(raw.status) ?? "pending").trim().toLowerCase() || "pending";
  let createdAt: Date | null = null;
  const created = str(raw.createdAt)?.trim();
  if (created) {
    const d = new Date(created);
    if (Number.isNaN(d.getTime())) problems.push("createdAt: not a valid date");
    else createdAt = d;
  }
  const parsed = adminReviewSchema.safeParse({
    authorName: str(raw.authorName) ?? "",
    authorRole: str(raw.authorRole),
    avatarUrl: str(raw.avatarUrl),
    rating: ratingNum,
    title: str(raw.title),
    body: str(raw.body) ?? "",
    status,
    featured: featured === "invalid" ? false : featured,
    sortOrder: sortOrder === "invalid" ? 0 : sortOrder,
    sourceUrl: str(raw.sourceUrl),
    adminReply: str(raw.adminReply),
    adminNote: undefined,
  });
  if (!parsed.success) problems.push(...issuesOf(parsed.error, 4));
  if (problems.length || !parsed.success) return { ok: false, errors: problems };
  return { ok: true, review: { ...parsed.data, source: safeSource, createdAt } };
}

function rowsFromCsv(text: string): Record<string, unknown>[] | string {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (grid.length < 2) return "The file needs a header row and at least one review.";
  const header = grid[0].map((h) => h.trim());
  const lookup = new Map(COLUMNS.map((c) => [c.toLowerCase(), c] as const));
  const keys = header.map((h) => lookup.get(h.toLowerCase().replace(/[\s_-]/g, "")) ?? null);
  if (!keys.includes("authorName") || !keys.includes("rating")) return "The header needs at least authorName and rating columns.";
  return grid.slice(1).map((cells) => {
    const row: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      if (k) row[k] = cells[i] ?? "";
    });
    return row;
  });
}

function rowsFromJson(text: string): Record<string, unknown>[] | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return "The file is not valid JSON.";
  }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { reviews?: unknown }).reviews) ? (raw as { reviews: unknown[] }).reviews : null;
  if (!list) return 'Expected a list of reviews, or an object like { "reviews": [...] }.';
  if (!list.every((r) => r && typeof r === "object" && !Array.isArray(r))) return "Every review must be an object.";
  return list as Record<string, unknown>[];
}

export function parseReviewImport(text: string): ImportParse {
  if (typeof text !== "string" || text.trim() === "") return { ok: false, errors: ["The file is empty."] };
  if (text.length > MAX_IMPORT_FILE_BYTES) return { ok: false, errors: [`The file is larger than ${Math.round(MAX_IMPORT_FILE_BYTES / 1000)} KB.`] };
  const looksJson = /^\s*[[{]/.test(text);
  const rows = looksJson ? rowsFromJson(text) : rowsFromCsv(text);
  if (typeof rows === "string") return { ok: false, errors: [rows] };
  if (rows.length === 0) return { ok: false, errors: ["There are no reviews in the file."] };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, errors: [`At most ${MAX_IMPORT_ROWS} reviews per import (this file has ${rows.length}).`] };

  const errors: string[] = [];
  const reviews: ImportedReview[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;
  rows.forEach((row, i) => {
    const r = parseRow(row);
    if (!r.ok) {
      for (const e of r.errors) errors.push(`Row ${i + 1}: ${e}`);
      return;
    }
    const fp = reviewFingerprint(r.review);
    if (seen.has(fp)) {
      duplicatesInFile += 1;
      return;
    }
    seen.add(fp);
    reviews.push(r.review);
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 12) };
  return { ok: true, reviews, duplicatesInFile };
}
