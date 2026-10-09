import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ flags: {} }));
vi.mock("@/lib/adapters/storage", () => ({
  saveUpload: vi.fn(), presignUpload: vi.fn(), isOwnStorageUrl: vi.fn(), deleteUpload: vi.fn(), storageKeyForUrl: vi.fn(),
  headStoredObject: vi.fn(), sniffStoredObject: vi.fn(), generateAndSaveThumbnail: vi.fn(),
}));
vi.mock("@/lib/adapters/ai", () => ({ generateAltText: vi.fn(), generateImageDescription: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ bumpUsage: vi.fn(), debumpUsage: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ checkUsage: vi.fn() }));
vi.mock("@/lib/adapters/unsplash", () => ({ searchUnsplash: vi.fn(), triggerUnsplashDownload: vi.fn(), isUnsplashUrl: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), RateLimitError: class extends Error {} }));
vi.mock("./_helpers", () => ({
  withPermission: vi.fn(async () => ({ active: { workspace: { id: "w1" } }, user: { id: "u1" } })),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    mediaFolder: { findUnique: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    mediaAsset: { updateMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

import { db } from "@/lib/db";
import { deleteFolderAction } from "./media";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.mediaAsset.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(db.mediaFolder.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(db.mediaFolder.delete).mockResolvedValue({} as never);
});

describe("deleteFolderAction", () => {
  it("moves files to Unfiled and subfolders up one level, then deletes the folder", async () => {
    vi.mocked(db.mediaFolder.findUnique).mockResolvedValue({ id: "f2", workspaceId: "w1", parentId: "f1" } as never);
    const r = await deleteFolderAction("f2");
    expect(r.ok).toBe(true);
    expect(db.mediaAsset.updateMany).toHaveBeenCalledWith({ where: { folderId: "f2", workspaceId: "w1" }, data: { folderId: null } });
    expect(db.mediaFolder.updateMany).toHaveBeenCalledWith({ where: { parentId: "f2", workspaceId: "w1" }, data: { parentId: "f1" } });
    expect(db.mediaFolder.delete).toHaveBeenCalledWith({ where: { id: "f2" } });
  });

  it("a top-level folder's subfolders become top-level", async () => {
    vi.mocked(db.mediaFolder.findUnique).mockResolvedValue({ id: "f1", workspaceId: "w1", parentId: null } as never);
    await deleteFolderAction("f1");
    expect(vi.mocked(db.mediaFolder.updateMany).mock.calls[0][0]).toMatchObject({ data: { parentId: null } });
  });

  it("refuses another workspace's folder and changes nothing", async () => {
    vi.mocked(db.mediaFolder.findUnique).mockResolvedValue({ id: "f9", workspaceId: "other", parentId: null } as never);
    const r = await deleteFolderAction("f9");
    expect(r.ok).toBe(false);
    expect(db.mediaFolder.delete).not.toHaveBeenCalled();
    expect(db.mediaFolder.updateMany).not.toHaveBeenCalled();
  });
});
