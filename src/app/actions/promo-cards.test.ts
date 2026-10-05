import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  archivePromoCardAction,
  createPromoCardAction,
  deletePromoCardAction,
  dismissPromoCardAction,
  seedStarterPromoCardsAction,
  setPromoCardEnabledAction,
  trackPromoCardAction,
  updatePromoCardAction,
  uploadPromoImageAction,
} from "./promo-cards";
import { db } from "@/lib/db";
import { getCurrentUser, requirePlatformAdmin } from "@/lib/session";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/adapters/storage", () => ({ isOwnStorageUrl: vi.fn(() => false), saveUpload: vi.fn() }));
vi.mock("@/lib/session", () => ({ requirePlatformAdmin: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    promoCard: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), count: vi.fn(), createMany: vi.fn() },
    promoCardEngagement: { upsert: vi.fn(), updateMany: vi.fn() },
  },
}));

const ADMIN = { id: "admin_1" };
const USER = { id: "user_1" };
const valid = { title: "Upgrade", description: "More stuff", ctaText: "Go", ctaUrl: "/settings/billing" };

/** What the real requirePlatformAdmin does for a non-admin: redirect() throws. */
const NOT_ADMIN = new Error("NEXT_REDIRECT");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue(ADMIN as never);
  vi.mocked(getCurrentUser).mockResolvedValue(USER as never);
  vi.mocked(db.promoCardEngagement.upsert).mockResolvedValue({} as never);
});

describe("admin-only actions", () => {
  const calls: [string, () => Promise<unknown>, () => unknown][] = [
    ["create", () => createPromoCardAction(valid), () => db.promoCard.create],
    ["update", () => updatePromoCardAction("c1", valid), () => db.promoCard.update],
    ["enable/disable", () => setPromoCardEnabledAction("c1", true), () => db.promoCard.update],
    ["archive", () => archivePromoCardAction("c1", true), () => db.promoCard.update],
    ["delete", () => deletePromoCardAction("c1"), () => db.promoCard.delete],
    ["seed", () => seedStarterPromoCardsAction(), () => db.promoCard.createMany],
    ["upload", () => uploadPromoImageAction(new FormData()), () => db.promoCard.create],
  ];

  it.each(calls)("%s is refused for a non-admin and touches nothing", async (_name, run, write) => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(NOT_ADMIN);
    await expect(run()).rejects.toBe(NOT_ADMIN);
    expect(write()).not.toHaveBeenCalled();
  });
});

describe("createPromoCardAction validation", () => {
  it("rejects an unsafe link with a field error and writes nothing", async () => {
    const res = await createPromoCardAction({ ...valid, ctaUrl: "javascript:alert(1)" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.fieldErrors?.ctaUrl).toBeTruthy();
    expect(db.promoCard.create).not.toHaveBeenCalled();
  });

  it("rejects an image hosted somewhere other than our storage", async () => {
    const res = await createPromoCardAction({ ...valid, imageUrl: "https://evil.example/x.png" });
    expect(res.ok).toBe(false);
    expect(db.promoCard.create).not.toHaveBeenCalled();
  });

  it("creates a valid card as a draft by default and records the creator", async () => {
    vi.mocked(db.promoCard.create).mockResolvedValue({ id: "c1", title: "Upgrade" } as never);
    const res = await createPromoCardAction(valid);
    expect(res).toEqual({ ok: true, id: "c1" });
    const data = vi.mocked(db.promoCard.create).mock.calls[0][0].data;
    expect(data).toMatchObject({ enabled: false, createdById: "admin_1", placement: "sidebar", targetPlans: "[]" });
  });

  it("accepts the dashboard placement", async () => {
    vi.mocked(db.promoCard.create).mockResolvedValue({ id: "c2", title: "x" } as never);
    await createPromoCardAction({ ...valid, placement: "dashboard" });
    expect(vi.mocked(db.promoCard.create).mock.calls[0][0].data).toMatchObject({ placement: "dashboard" });
  });
});

describe("seedStarterPromoCardsAction", () => {
  it("inserts only paused, verified starter cards and never the affiliate card", async () => {
    vi.mocked(db.promoCard.count).mockResolvedValue(0);
    const res = await seedStarterPromoCardsAction();
    expect(res.ok).toBe(true);
    const rows = vi.mocked(db.promoCard.createMany).mock.calls[0]![0]!.data as { title: string; enabled: boolean; ctaUrl: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.enabled === false)).toBe(true);
    expect(rows.some((r) => r.ctaUrl === "/affiliate")).toBe(false);
  });

  it("does nothing when cards already exist", async () => {
    vi.mocked(db.promoCard.count).mockResolvedValue(2);
    expect((await seedStarterPromoCardsAction()).ok).toBe(false);
    expect(db.promoCard.createMany).not.toHaveBeenCalled();
  });
});

describe("dismissPromoCardAction", () => {
  it("fails quietly when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await dismissPromoCardAction("c1")).ok).toBe(false);
    expect(db.promoCardEngagement.upsert).not.toHaveBeenCalled();
  });

  it("refuses to dismiss a non-dismissible card", async () => {
    vi.mocked(db.promoCard.findUnique).mockResolvedValue({ dismissible: false } as never);
    expect((await dismissPromoCardAction("c1")).ok).toBe(false);
    expect(db.promoCardEngagement.upsert).not.toHaveBeenCalled();
  });

  it("stores the dismissal for this user only", async () => {
    vi.mocked(db.promoCard.findUnique).mockResolvedValue({ dismissible: true } as never);
    expect((await dismissPromoCardAction("c1")).ok).toBe(true);
    expect(vi.mocked(db.promoCardEngagement.upsert).mock.calls[0][0].where).toEqual({ cardId_userId: { cardId: "c1", userId: "user_1" } });
  });
});

describe("trackPromoCardAction (unique-user counting)", () => {
  const live = { enabled: true, archivedAt: null, startsAt: null, endsAt: null };

  it("ignores signed-out callers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await trackPromoCardAction("c1", "impression");
    expect(db.promoCard.findUnique).not.toHaveBeenCalled();
  });

  it("ignores cards that are not live", async () => {
    vi.mocked(db.promoCard.findUnique).mockResolvedValue({ ...live, enabled: false } as never);
    await trackPromoCardAction("c1", "click");
    expect(db.promoCard.update).not.toHaveBeenCalled();
  });

  it("counts the first view and click from a user", async () => {
    vi.mocked(db.promoCard.findUnique).mockResolvedValue(live as never);
    vi.mocked(db.promoCardEngagement.updateMany).mockResolvedValue({ count: 1 });
    await trackPromoCardAction("c1", "impression");
    await trackPromoCardAction("c1", "click");
    expect(vi.mocked(db.promoCard.update).mock.calls.map((c) => c[0].data)).toEqual([
      { impressions: { increment: 1 } },
      { clicks: { increment: 1 } },
    ]);
  });

  it("does not count a repeat from the same user", async () => {
    vi.mocked(db.promoCard.findUnique).mockResolvedValue(live as never);
    vi.mocked(db.promoCardEngagement.updateMany).mockResolvedValue({ count: 0 }); // viewedAt already set
    for (let i = 0; i < 5; i++) await trackPromoCardAction("c1", "impression");
    expect(db.promoCard.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown event kind", async () => {
    await trackPromoCardAction("c1", "nonsense" as never);
    expect(db.promoCard.findUnique).not.toHaveBeenCalled();
  });
});
