import { describe, it, expect, vi, beforeEach } from "vitest";
import { bulkReviewAction, importReviewsAction, updateReviewAction } from "./admin-reviews";
import { checkReviewPromptAction, submitReviewAction } from "./reviews";
import { requirePlatformAdmin, requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logAudit } from "@/lib/events";
import { DEFAULT_REVIEW_CONFIG } from "@/lib/reviews/config";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => {
  // one function for both guards: the actions now ask for a named permission, the tests only care whether the caller is an admin
  const guard = vi.fn();
  return { requirePlatformAdmin: guard, requireAdminPermission: guard, requireWorkspace: vi.fn() };
});
vi.mock("@/lib/entitlements", () => ({ orgPlan: vi.fn().mockResolvedValue({ key: "free" }) }));
vi.mock("@/lib/reviews/store", () => ({
  REVIEW_CONFIG_KEY: "review_config",
  loadReviewConfig: vi.fn(),
  saveReviewConfig: vi.fn(),
  resetReviewConfig: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
  RateLimitError: class RateLimitError extends Error {
    constructor(public resetAt: number) {
      super("Too many requests");
    }
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    review: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    reviewPrompt: { findUnique: vi.fn(), upsert: vi.fn() },
    post: { count: vi.fn() },
  },
}));

import { loadReviewConfig } from "@/lib/reviews/store";

const admin = { id: "admin1" };
const redirect = () => Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;/dashboard" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue(admin as never);
  vi.mocked(enforceRateLimit).mockResolvedValue(undefined as never);
  vi.mocked(loadReviewConfig).mockResolvedValue(DEFAULT_REVIEW_CONFIG);
  delete process.env.REVIEW_PROMPT_DISABLED;
});

describe("admin review actions", () => {
  it("are admin only: a non-admin is stopped before anything is read or written", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(redirect());
    await expect(bulkReviewAction({ ids: ["r1"], op: "approve" })).rejects.toThrow("NEXT_REDIRECT");
    await expect(importReviewsAction("authorName,rating\nA,5")).rejects.toThrow("NEXT_REDIRECT");
    expect(db.review.updateMany).not.toHaveBeenCalled();
    expect(db.review.createMany).not.toHaveBeenCalled();
  });

  it("publishes only reviews that have text and may be public", async () => {
    vi.mocked(db.review.findMany).mockResolvedValue([{ id: "r1", publishedAt: null }] as never);
    vi.mocked(db.review.updateMany).mockResolvedValue({ count: 1 } as never);
    const res = await bulkReviewAction({ ids: ["r1", "r2"], op: "approve" });
    expect(res.ok).toBe(true);
    // The lookup filters out empty bodies and in-app reviews without consent.
    const where = vi.mocked(db.review.findMany).mock.calls[0][0]?.where as Record<string, unknown>;
    expect(where.body).toEqual({ not: "" });
    expect(JSON.stringify(where.OR)).toContain("publicConsent");
    if (res.ok) expect(res.message).toMatch(/1 review published, 1 skipped/);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.review_bulk_approve" }));
  });

  it("validates a bulk request: nothing selected, or too many, is refused", async () => {
    expect((await bulkReviewAction({ ids: [], op: "hide" })).ok).toBe(false);
    expect((await bulkReviewAction({ ids: Array.from({ length: 101 }, (_, i) => `r${i}`), op: "hide" })).ok).toBe(false);
    expect((await bulkReviewAction({ ids: ["r1"], op: "explode" })).ok).toBe(false);
    expect(db.review.updateMany).not.toHaveBeenCalled();
  });

  it("will not publish an in-app review whose author didn't agree", async () => {
    vi.mocked(db.review.findUnique).mockResolvedValue({ status: "hidden", publishedAt: null, source: "in_app", publicConsent: false } as never);
    const res = await updateReviewAction("r1", { authorName: "A", rating: 5, body: "words words words", status: "approved", featured: false, sortOrder: 0 });
    expect(res.ok).toBe(false);
    expect(db.review.update).not.toHaveBeenCalled();
  });

  it("imports new reviews, skips ones already stored, and audits it", async () => {
    vi.mocked(db.review.findMany).mockResolvedValue([{ authorName: "Maya", rating: 5, body: "already here" }] as never);
    vi.mocked(db.review.createMany).mockResolvedValue({ count: 1 } as never);
    const text = JSON.stringify([
      { authorName: "Maya", rating: 5, body: "already here" },
      { authorName: "Sam", rating: 4, body: "a new one" },
    ]);
    const res = await importReviewsAction(text);
    expect(res).toMatchObject({ ok: true, added: 1, skipped: 1 });
    const data = (vi.mocked(db.review.createMany).mock.calls[0][0] as { data: { authorName: string; status: string }[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ authorName: "Sam", status: "pending" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.reviews_imported" }));
  });

  it("imports nothing when any row is bad", async () => {
    const res = await importReviewsAction("authorName,rating\nGood,5\nBad,12");
    expect(res.ok).toBe(false);
    expect(db.review.createMany).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(Date.now() + 1000));
    const res = await importReviewsAction("authorName,rating\nA,5");
    expect(res.ok).toBe(false);
    expect(db.review.createMany).not.toHaveBeenCalled();
  });
});

const ctx = { user: { id: "u1", name: "Maya Chen", createdAt: new Date("2026-01-01") }, active: { org: { id: "o1" } } };
const review = { id: "rv1", rating: 5, status: "pending", publicConsent: true, authorName: "Maya Chen", authorRole: null, title: null, body: "x", source: "in_app" };
const input = { rating: 5, title: "", body: "Scheduling a week of posts takes minutes.", displayName: "Maya Chen", role: "", publicConsent: true };

describe("submitting a review", () => {
  beforeEach(() => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx as never);
    vi.mocked(db.review.upsert).mockResolvedValue(review as never);
  });

  it("holds it for moderation, marks the user as reviewed and audits it", async () => {
    const res = await submitReviewAction(input);
    expect(res).toMatchObject({ ok: true, visibility: "queued" });
    const args = vi.mocked(db.review.upsert).mock.calls[0][0];
    expect(args.where).toEqual({ userId: "u1" });
    expect(args.create).toMatchObject({ source: "in_app", status: "pending", publicConsent: true, userId: "u1" });
    expect(db.reviewPrompt.upsert).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "review.submitted", actorId: "u1" }));
  });

  it("publishes straight away only when auto-approve is on and the author agreed", async () => {
    vi.mocked(loadReviewConfig).mockResolvedValue({ ...DEFAULT_REVIEW_CONFIG, display: { ...DEFAULT_REVIEW_CONFIG.display, autoApprove: true } });
    vi.mocked(db.review.upsert).mockResolvedValue({ ...review, status: "approved" } as never);
    expect(await submitReviewAction(input)).toMatchObject({ ok: true, visibility: "published" });
    expect(vi.mocked(db.review.upsert).mock.calls[0][0].create).toMatchObject({ status: "approved" });
  });

  it("keeps a review private without consent: never queued, never offered other review sites", async () => {
    vi.mocked(loadReviewConfig).mockResolvedValue({ ...DEFAULT_REVIEW_CONFIG, externalLinks: [{ id: "g", label: "G2", url: "https://g2.com/x" }] });
    vi.mocked(db.review.upsert).mockResolvedValue({ ...review, status: "hidden", publicConsent: false } as never);
    const res = await submitReviewAction({ ...input, publicConsent: false });
    expect(res).toMatchObject({ ok: true, visibility: "private", externalLinks: [] });
    expect(vi.mocked(db.review.upsert).mock.calls[0][0].create).toMatchObject({ status: "hidden", publicConsent: false });
  });

  it("rejects bad input without touching the database", async () => {
    const res = await submitReviewAction({ ...input, rating: 9 });
    expect(res.ok).toBe(false);
    expect(db.review.upsert).not.toHaveBeenCalled();
  });

  it("is rate limited and never throws on a storage failure", async () => {
    vi.mocked(enforceRateLimit).mockRejectedValueOnce(new RateLimitError(Date.now() + 1000));
    expect((await submitReviewAction(input)).ok).toBe(false);
    vi.mocked(db.review.upsert).mockRejectedValueOnce(new Error("relation does not exist"));
    const res = await submitReviewAction(input);
    expect(res.ok).toBe(false);
  });
});

describe("the review popup check", () => {
  beforeEach(() => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx as never);
    vi.mocked(db.reviewPrompt.findUnique).mockResolvedValue(null as never);
    vi.mocked(db.review.findUnique).mockResolvedValue(null as never);
    vi.mocked(db.post.count).mockResolvedValue(8 as never);
  });

  it("asks an eligible user", async () => {
    expect((await checkReviewPromptAction()).ask).toBe(true);
  });

  it("stays quiet when the kill switch is set, without even looking anything up", async () => {
    process.env.REVIEW_PROMPT_DISABLED = "1";
    expect((await checkReviewPromptAction()).ask).toBe(false);
    expect(db.post.count).not.toHaveBeenCalled();
  });

  it("stays quiet, never errors, when the database fails", async () => {
    vi.mocked(db.post.count).mockRejectedValue(new Error("db down"));
    expect((await checkReviewPromptAction()).ask).toBe(false);
  });
});
