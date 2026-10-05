import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDashboardPrefsAction, saveDashboardPrefsAction, saveSidebarPrefsAction } from "./ui-prefs";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { userPreference: { upsert: vi.fn(), updateMany: vi.fn() } } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
});

describe("ui preference actions", () => {
  it("do nothing and report an error when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await saveDashboardPrefsAction({})).ok).toBe(false);
    expect((await saveSidebarPrefsAction({})).ok).toBe(false);
    expect((await resetDashboardPrefsAction()).ok).toBe(false);
    expect(db.userPreference.upsert).not.toHaveBeenCalled();
    expect(db.userPreference.updateMany).not.toHaveBeenCalled();
  });

  it("sanitise whatever the client sends before storing it", async () => {
    await saveDashboardPrefsAction({ order: ["goals", "<script>"], hidden: ["ai", 42], layout: "evil", extra: "x" });
    const stored = JSON.parse(vi.mocked(db.userPreference.upsert).mock.calls[0][0].update.dashboard as string);
    expect(stored.order[0]).toBe("goals");
    expect(stored.order).not.toContain("<script>");
    expect(stored).toEqual({ order: expect.any(Array), hidden: ["ai"], layout: "split" });
  });

  it("only lets users hide real, titled nav sections", async () => {
    await saveSidebarPrefsAction({ showPromos: false, hiddenGroups: ["Create", "Nope", ""] });
    const stored = JSON.parse(vi.mocked(db.userPreference.upsert).mock.calls[0][0].update.sidebar as string);
    expect(stored).toEqual({ showPromos: false, hiddenGroups: ["Create"] });
  });

  it("scopes every write to the signed-in user", async () => {
    await saveSidebarPrefsAction({});
    await resetDashboardPrefsAction();
    expect(vi.mocked(db.userPreference.upsert).mock.calls[0][0].where).toEqual({ userId: "u1" });
    expect(vi.mocked(db.userPreference.updateMany).mock.calls[0][0].where).toEqual({ userId: "u1" });
  });

  it("surface a database failure as an error result, not a throw", async () => {
    vi.mocked(db.userPreference.upsert).mockRejectedValue(new Error("db down"));
    const res = await saveDashboardPrefsAction({});
    expect(res.ok).toBe(false);
  });
});
