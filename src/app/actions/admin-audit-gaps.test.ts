import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/session", () => {
  // one function for both guards: the actions now ask for a named permission, the tests only care whether the caller is an admin
  const guard = vi.fn(async () => ({ id: "admin1" }));
  return { requirePlatformAdmin: guard, requireAdminPermission: guard };
});
vi.mock("@/lib/events", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/observe", () => ({ recordSystemEvent: vi.fn() }));
vi.mock("@/lib/admin-notifications", () => ({ createAdminNotification: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    systemEvent: { deleteMany: vi.fn() },
    blogPost: { updateMany: vi.fn() },
    blogCategory: { delete: vi.fn() },
    blogTag: { delete: vi.fn() },
    blogAuthor: { delete: vi.fn() },
    blogComment: { deleteMany: vi.fn(), updateMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { clearSystemEventsAction, deleteSystemEventAction } from "./admin-observability";
import { bulkModerateCommentsAction, deleteBlogAuthorAction, deleteBlogCategoryAction, deleteBlogTagAction } from "./blog";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.systemEvent.deleteMany).mockResolvedValue({ count: 7 } as never);
  vi.mocked(db.blogComment.deleteMany).mockResolvedValue({ count: 2 } as never);
  vi.mocked(db.blogComment.updateMany).mockResolvedValue({ count: 2 } as never);
});

const audited = () => vi.mocked(logAudit).mock.calls.map((c) => c[0]);

describe("destructive admin actions leave an audit record", () => {
  it("purging system events records who, how many and which filter", async () => {
    await clearSystemEventsAction({ olderThanDays: 30, onlyErrors: true });
    expect(audited()).toEqual([expect.objectContaining({ actorId: "admin1", action: "admin.system_events_purged", metadata: expect.objectContaining({ deleted: 7, onlyErrors: true, olderThanDays: 30 }) })]);
  });

  it("dismissing one event is recorded only if something was removed", async () => {
    await deleteSystemEventAction("e1");
    expect(audited()).toEqual([expect.objectContaining({ action: "admin.system_event_dismissed", targetId: "e1" })]);
    vi.mocked(logAudit).mockClear();
    vi.mocked(db.systemEvent.deleteMany).mockResolvedValue({ count: 0 } as never);
    await deleteSystemEventAction("missing");
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("deleting a blog category, tag or author is recorded", async () => {
    await deleteBlogCategoryAction("c1");
    await deleteBlogTagAction("t1");
    await deleteBlogAuthorAction("a1");
    expect(audited().map((a) => a.action)).toEqual(["admin.blog_category_deleted", "admin.blog_tag_deleted", "admin.blog_author_deleted"]);
  });

  it("a failing audit write never breaks the action", async () => {
    vi.mocked(logAudit).mockRejectedValueOnce(new Error("audit db down"));
    await expect(deleteBlogTagAction("t1")).resolves.toEqual({ ok: true });
  });
});

describe("bulk comment moderation is bounded, validated and audited", () => {
  it("records a bulk delete with its count", async () => {
    const r = await bulkModerateCommentsAction(["a", "b"], "deleted");
    expect(r).toEqual({ ok: true, count: 2 });
    expect(db.blogComment.deleteMany).toHaveBeenCalledOnce();
    expect(audited()[0]).toMatchObject({ action: "admin.blog_comments_deleted", metadata: { count: 2 } });
  });

  it("refuses an oversized selection, an unknown status and junk ids, touching nothing", async () => {
    const big = Array.from({ length: 501 }, (_, i) => `c${i}`);
    expect((await bulkModerateCommentsAction(big, "spam")).ok).toBe(false);
    expect((await bulkModerateCommentsAction(["a"], "pwned" as never)).ok).toBe(false);
    expect((await bulkModerateCommentsAction([], "spam")).ok).toBe(false);
    expect(db.blogComment.updateMany).not.toHaveBeenCalled();
    expect(db.blogComment.deleteMany).not.toHaveBeenCalled();
  });

  it("drops non-string and oversized ids before querying", async () => {
    await bulkModerateCommentsAction(["ok", 5 as never, "x".repeat(200)], "approved");
    expect(vi.mocked(db.blogComment.updateMany).mock.calls[0][0]!.where).toEqual({ id: { in: ["ok"] } });
  });
});

describe("blog settings are validated and audited", () => {
  it("rejects unbounded, oddly-keyed or non-text settings", async () => {
    const { updateBlogSettingsAction } = await import("./blog");
    const many = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`k${i}`, "v"]));
    for (const bad of [{}, many, { "bad key!": "v" }, { ok: 5 as never }, { ok: "x".repeat(5001) }, null as never]) {
      expect((await updateBlogSettingsAction(bad)).ok).toBe(false);
    }
  });
});
