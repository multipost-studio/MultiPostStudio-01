import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  isOwnStorageUrl: vi.fn(),
  storageKeyForUrl: vi.fn(),
  headStoredObject: vi.fn(),
  sniffStoredObject: vi.fn(),
  deleteUpload: vi.fn(),
  uploadOwnerWorkspace: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ flags: {} }));
vi.mock("@/lib/adapters/storage", () => ({
  saveUpload: vi.fn(),
  presignUpload: vi.fn(),
  isOwnStorageUrl: st.isOwnStorageUrl,
  deleteUpload: st.deleteUpload,
  storageKeyForUrl: st.storageKeyForUrl,
  headStoredObject: st.headStoredObject,
  sniffStoredObject: st.sniffStoredObject,
  generateAndSaveThumbnail: vi.fn(),
  uploadOwnerWorkspace: st.uploadOwnerWorkspace,
}));
vi.mock("@/lib/adapters/ai", () => ({ generateAltText: () => "alt", generateImageDescription: () => "desc" }));
vi.mock("@/lib/adapters/billing", () => ({ bumpUsage: vi.fn(), debumpUsage: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ checkUsage: vi.fn().mockResolvedValue({ over: false, used: 0, limit: 0, pct: 0 }) }));
vi.mock("@/lib/adapters/unsplash", () => ({ searchUnsplash: vi.fn(), triggerUnsplashDownload: vi.fn(), isUnsplashUrl: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), RateLimitError: class extends Error {} }));
vi.mock("@/lib/idempotency", () => ({ claimIdempotencyKey: vi.fn().mockResolvedValue(true) }));
vi.mock("./_helpers", () => ({
  withPermission: vi.fn(async () => ({ active: { workspace: { id: "wB" }, org: { id: "oB" } }, user: { id: "u1" } })),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));
vi.mock("@/lib/media-types", async () => {
  const real = await vi.importActual<typeof import("@/lib/media-types")>("@/lib/media-types");
  return { ...real, resolveFolderId: vi.fn().mockResolvedValue(null) };
});
vi.mock("@/lib/db", () => ({
  db: {
    mediaAsset: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
    mediaOnPost: { count: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { deleteAssetAction, registerMediaAction } from "./media";

const URL_A = "https://cdn.test/uploads/2026/10/aaaa.png";
const input = { key: "uploads/2026/10/aaaa.png", url: URL_A, filename: "a.png", contentType: "image/png", sizeBytes: 1000 };

beforeEach(() => {
  vi.clearAllMocks();
  st.isOwnStorageUrl.mockReturnValue(true);
  st.storageKeyForUrl.mockReturnValue("uploads/2026/10/aaaa.png");
  st.headStoredObject.mockResolvedValue({ contentType: "image/png", sizeBytes: 1000 });
  st.sniffStoredObject.mockResolvedValue("image/png");
  st.deleteUpload.mockResolvedValue(undefined);
  st.uploadOwnerWorkspace.mockReturnValue(null);
  vi.mocked(db.mediaAsset.count).mockResolvedValue(0 as never);
  vi.mocked(db.mediaAsset.aggregate).mockResolvedValue({ _sum: { sizeBytes: 0 } } as never);
  vi.mocked(db.mediaAsset.create).mockResolvedValue({ id: "newAsset" } as never);
  vi.mocked(db.mediaOnPost.count).mockResolvedValue(0 as never);
  vi.mocked(db.mediaAsset.delete).mockResolvedValue({} as never);
});

describe("registering a file someone else already owns", () => {
  it("accepts a fresh upload", async () => {
    const r = await registerMediaAction(input);
    expect(r.ok).toBe(true);
    expect(db.mediaAsset.create).toHaveBeenCalledOnce();
  });

  it("refuses an object that another asset (any workspace) already references", async () => {
    vi.mocked(db.mediaAsset.count).mockResolvedValue(1 as never);
    const r = await registerMediaAction(input);
    expect(r.ok).toBe(false);
    expect(db.mediaAsset.create).not.toHaveBeenCalled();
    const where = vi.mocked(db.mediaAsset.count).mock.calls[0][0]!.where as { OR: unknown[] };
    expect(JSON.stringify(where.OR)).toContain(URL_A);
  });

  it("refuses to pin another tenant's object as a thumbnail", async () => {
    vi.mocked(db.mediaAsset.count).mockResolvedValueOnce(0 as never).mockResolvedValueOnce(1 as never);
    st.storageKeyForUrl.mockImplementation((u: string) => (u === URL_A ? "uploads/2026/10/aaaa.png" : "uploads/2026/10/thumb.png"));
    const r = await registerMediaAction({ ...input, thumbUrl: "https://cdn.test/uploads/2026/10/thumb.png" });
    expect(r.ok).toBe(false);
    expect(db.mediaAsset.create).not.toHaveBeenCalled();
  });
});

describe("registering a file minted for another workspace", () => {
  it("accepts a key minted for this workspace", async () => {
    st.uploadOwnerWorkspace.mockReturnValue("wB");
    expect((await registerMediaAction(input)).ok).toBe(true);
  });

  it("refuses a key minted for a different workspace, before anything is created", async () => {
    st.uploadOwnerWorkspace.mockReturnValue("wOther");
    const r = await registerMediaAction(input);
    expect(r.ok).toBe(false);
    expect(db.mediaAsset.create).not.toHaveBeenCalled();
  });

  it("refuses a thumbnail minted for a different workspace", async () => {
    st.storageKeyForUrl.mockImplementation((u: string) => (u === URL_A ? "uploads/2026/10/aaaa.png" : "uploads/wOther/2026/10/thumb.png"));
    st.uploadOwnerWorkspace.mockImplementation((k: string) => (k.includes("wOther") ? "wOther" : null));
    const r = await registerMediaAction({ ...input, thumbUrl: "https://cdn.test/uploads/wOther/2026/10/thumb.png" });
    expect(r.ok).toBe(false);
    expect(db.mediaAsset.create).not.toHaveBeenCalled();
  });

  it("leaves older, unprefixed objects to the 'already referenced' check", async () => {
    st.uploadOwnerWorkspace.mockReturnValue(null);
    expect((await registerMediaAction(input)).ok).toBe(true);
  });
});

describe("deleting an asset never destroys an object another asset still uses", () => {
  const asset = { id: "assetB", workspaceId: "wB", url: URL_A, thumbUrl: URL_A, sizeBytes: 1000 };

  it("removes the stored object when nothing else points at it", async () => {
    vi.mocked(db.mediaAsset.findUnique).mockResolvedValue(asset as never);
    const r = await deleteAssetAction("assetB");
    expect(r.ok).toBe(true);
    expect(st.deleteUpload).toHaveBeenCalledWith("uploads/2026/10/aaaa.png");
  });

  it("keeps the object when another asset (for example another workspace's) still references it", async () => {
    vi.mocked(db.mediaAsset.findUnique).mockResolvedValue(asset as never);
    vi.mocked(db.mediaAsset.count).mockResolvedValue(1 as never);
    const r = await deleteAssetAction("assetB");
    expect(r.ok).toBe(true); // B's own row is gone...
    expect(db.mediaAsset.delete).toHaveBeenCalled();
    expect(st.deleteUpload).not.toHaveBeenCalled(); // ...but A's file is untouched
  });

  it("cannot delete another workspace's asset at all", async () => {
    vi.mocked(db.mediaAsset.findUnique).mockResolvedValue({ ...asset, workspaceId: "wA" } as never);
    const r = await deleteAssetAction("assetB");
    expect(r.ok).toBe(false);
    expect(db.mediaAsset.delete).not.toHaveBeenCalled();
    expect(st.deleteUpload).not.toHaveBeenCalled();
  });
});
