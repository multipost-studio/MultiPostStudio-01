import { describe, it, expect, vi, beforeEach } from "vitest";
import { broadcastToAudienceAction, deleteSegmentAction, previewAudienceAction, saveSegmentAction } from "./marketing-admin";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { resolveAudience } from "@/lib/marketing-analytics";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/session", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/marketing-analytics", () => ({ resolveAudience: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    notification: { createMany: vi.fn() },
    marketingSegment: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

const NOT_ADMIN = new Error("NEXT_REDIRECT");
const member = (i: number) => ({ id: `u${i}`, name: `U${i}`, email: `u${i}@x.com`, createdAt: new Date(), plan: "free", channel: "Paid Search", source: "google", campaign: null });
const audience = (n: number, extra = {}) => ({ total: n, truncated: false, byPlan: [{ plan: "free", count: n }], members: Array.from({ length: n }, (_, i) => member(i)), ...extra });
const send = (o: Partial<Parameters<typeof broadcastToAudienceAction>[0]> = {}) =>
  broadcastToAudienceAction({ filter: { sources: ["google"] }, title: "Hi", body: "Hello", expectedTotal: 3, ...o });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({ id: "admin_1" } as never);
  vi.mocked(resolveAudience).mockResolvedValue(audience(3) as never);
});

describe("admin-only", () => {
  it("every marketing action refuses a non-admin and touches nothing", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(NOT_ADMIN);
    await expect(previewAudienceAction({})).rejects.toBe(NOT_ADMIN);
    await expect(saveSegmentAction({ name: "x", filter: {} })).rejects.toBe(NOT_ADMIN);
    await expect(deleteSegmentAction("s1")).rejects.toBe(NOT_ADMIN);
    await expect(send()).rejects.toBe(NOT_ADMIN);
    expect(resolveAudience).not.toHaveBeenCalled();
    expect(db.notification.createMany).not.toHaveBeenCalled();
    expect(db.marketingSegment.create).not.toHaveBeenCalled();
  });
});

describe("previewAudienceAction", () => {
  it("returns counts, plan split and a capped sample", async () => {
    vi.mocked(resolveAudience).mockResolvedValue(audience(40) as never);
    const r = await previewAudienceAction({ sources: ["google"] });
    expect(r.ok && r.preview.total).toBe(40);
    expect(r.ok && r.preview.sample).toHaveLength(25);
    expect(r.ok && r.preview.description).toContain("source google");
  });

  it("cleans the filter it was given", async () => {
    await previewAudienceAction({ sources: ["FB"], channels: ["Hacked" as never] });
    // an invalid channel makes the whole filter fall back to empty rather than being trusted
    expect(vi.mocked(resolveAudience).mock.calls[0]![0]).toMatchObject({ channels: [], sources: [] });
  });
});

describe("saveSegmentAction", () => {
  it("requires a name and stores the cleaned filter", async () => {
    expect((await saveSegmentAction({ name: "  ", filter: {} })).ok).toBe(false);
    vi.mocked(db.marketingSegment.create).mockResolvedValue({ id: "s1" } as never);
    const r = await saveSegmentAction({ name: "Google leads", filter: { sources: ["Google"] } });
    expect(r).toEqual({ ok: true, id: "s1" });
    const data = vi.mocked(db.marketingSegment.create).mock.calls[0]![0].data;
    expect(JSON.parse(data.filter).sources).toEqual(["google"]);
    expect(data.createdById).toBe("admin_1");
  });
});

describe("broadcastToAudienceAction safety rails", () => {
  it("sends to exactly the reviewed audience", async () => {
    const r = await send();
    expect(r).toEqual({ ok: true, sent: 3 });
    const rows = vi.mocked(db.notification.createMany).mock.calls[0]![0]!.data as { userId: string; type: string }[];
    expect(rows.map((x) => x.userId)).toEqual(["u0", "u1", "u2"]);
    expect(rows.every((x) => x.type === "system")).toBe(true);
  });

  it("refuses when the audience changed since it was reviewed", async () => {
    vi.mocked(resolveAudience).mockResolvedValue(audience(7) as never);
    const r = await send({ expectedTotal: 3 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/changed/);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it("refuses an empty filter (that is what Broadcast is for)", async () => {
    const r = await send({ filter: {} });
    expect(r.ok).toBe(false);
    expect(resolveAudience).not.toHaveBeenCalled();
  });

  it("refuses oversize or truncated audiences", async () => {
    vi.mocked(resolveAudience).mockResolvedValue(audience(3, { truncated: true }) as never);
    expect((await send()).ok).toBe(false);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it("refuses unsafe links and missing copy", async () => {
    expect((await send({ linkUrl: "javascript:alert(1)" })).ok).toBe(false);
    expect((await send({ title: " " })).ok).toBe(false);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it("refuses an audience of nobody", async () => {
    vi.mocked(resolveAudience).mockResolvedValue(audience(0) as never);
    expect((await send({ expectedTotal: 0 })).ok).toBe(false);
  });
});
