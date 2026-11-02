import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  user: { id: "u1", isImpersonated: false } as Record<string, unknown>,
  channels: [] as { id: string; platform: string; name: string; _count: { queueSlots: number } }[],
  deleted: [] as unknown[],
  created: [] as unknown[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => m.ctx), requireUser: vi.fn(async () => m.user) }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/db", () => ({
  db: {
    socialChannel: { findMany: vi.fn(async (a: { where: { id?: string } }) => m.channels.filter((c) => !a.where.id || c.id === a.where.id)) },
    queueSlot: {
      deleteMany: vi.fn((a: unknown) => (m.deleted.push(a), "del")),
      createMany: vi.fn((a: unknown) => (m.created.push(a), "create")),
    },
    $transaction: vi.fn(async () => undefined),
    user: { update: vi.fn(async () => ({})) },
  },
}));

import { db } from "@/lib/db";
import { applySuggestedTimesAction, setProfileTimezoneAction } from "./posting-times";

const ctxWith = (role: string, impersonated = false) => ({
  user: { id: "u1", isImpersonated: impersonated },
  active: { role, workspace: { id: "w1" } },
});

beforeEach(() => {
  vi.clearAllMocks();
  m.deleted = [];
  m.created = [];
  m.user = { id: "u1", isImpersonated: false };
  m.ctx = ctxWith("owner");
  m.channels = [
    { id: "c1", platform: "instagram", name: "Insta", _count: { queueSlots: 0 } },
    { id: "c2", platform: "linkedin", name: "LinkedIn", _count: { queueSlots: 3 } },
  ];
});

describe("applySuggestedTimesAction", () => {
  it("rejects a viewer without publish permission", async () => {
    m.ctx = ctxWith("viewer");
    const r = await applySuggestedTimesAction("c1", 3);
    expect(r.ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects while impersonating", async () => {
    m.ctx = ctxWith("owner", true);
    expect((await applySuggestedTimesAction("c1", 3)).ok).toBe(false);
  });

  it("rejects a frequency that is not offered", async () => {
    const r = await applySuggestedTimesAction("c1", 4);
    expect(r.ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("fills only the empty channels when asked for all", async () => {
    const r = await applySuggestedTimesAction("all-empty", 3);
    expect(r.ok).toBe(true);
    expect(r.data?.channels).toBe(1);
    expect(m.deleted).toEqual([{ where: { channelId: "c1", workspaceId: "w1" } }]);
    expect(m.created).toHaveLength(1);
  });

  it("never overwrites a channel that has times unless replace is set", async () => {
    const keep = await applySuggestedTimesAction("c2", 3);
    expect(keep.ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();

    const replaced = await applySuggestedTimesAction("c2", 3, true);
    expect(replaced.ok).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("says so when every channel already has times", async () => {
    m.channels = [{ id: "c2", platform: "linkedin", name: "LinkedIn", _count: { queueSlots: 3 } }];
    const r = await applySuggestedTimesAction("all-empty", 3);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already has posting times/);
  });

  it("reports a channel that is not in this workspace", async () => {
    m.channels = [];
    expect((await applySuggestedTimesAction("nope", 3)).error).toBe("Channel not found");
  });
});

describe("setProfileTimezoneAction", () => {
  it("saves a valid zone on the signed-in user only", async () => {
    const r = await setProfileTimezoneAction("Asia/Kolkata");
    expect(r.ok).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { timezone: "Asia/Kolkata" } });
  });

  it("rejects an unknown zone without touching the database", async () => {
    expect((await setProfileTimezoneAction("Mars/Olympus")).ok).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects while impersonating", async () => {
    m.user = { id: "u1", isImpersonated: true };
    expect((await setProfileTimezoneAction("Asia/Kolkata")).ok).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
