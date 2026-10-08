import { describe, it, expect, vi, beforeEach } from "vitest";
import { notify, notifyWorkspace } from "./events";
import { db } from "@/lib/db";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ flags: { realEmail: false } }));
vi.mock("@/lib/adapters/email", () => ({ sendNotificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    notification: { create: vi.fn(), createMany: vi.fn() },
    notificationPref: { findMany: vi.fn() },
    workspaceMember: { findMany: vi.fn() },
  },
}));

const n = { type: "publish_success", title: "Posted", body: "Your post went live" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.notification.create).mockResolvedValue({ id: "n1" } as never);
  vi.mocked(db.notification.createMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(db.notificationPref.findMany).mockResolvedValue([] as never);
});

describe("in-app notification preference", () => {
  it("creates the bell entry by default", async () => {
    const row = await notify({ userId: "u1", ...n });
    expect(row).toEqual({ id: "n1" });
    expect(db.notification.create).toHaveBeenCalledOnce();
  });

  it("creates nothing for a user who switched in-app notifications off", async () => {
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1" }] as never);
    const row = await notify({ userId: "u1", ...n });
    expect(row).toBeNull();
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it("only looks up users who opted out (inappAll false)", async () => {
    await notify({ userId: "u1", ...n });
    expect(db.notificationPref.findMany).toHaveBeenCalledWith({ where: { userId: { in: ["u1"] }, inappAll: false }, select: { userId: true } });
  });

  it("a failed preference lookup never swallows the notification", async () => {
    vi.mocked(db.notificationPref.findMany).mockRejectedValue(new Error("db down"));
    const row = await notify({ userId: "u1", ...n });
    expect(row).toEqual({ id: "n1" });
  });

  it("workspace notifications skip only the opted-out members", async () => {
    vi.mocked(db.workspaceMember.findMany).mockResolvedValue([{ userId: "a" }, { userId: "b" }, { userId: "c" }] as never);
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "b" }] as never);
    await notifyWorkspace("w1", n, "c");
    const data = (vi.mocked(db.notification.createMany).mock.calls[0]?.[0]?.data ?? []) as { userId: string }[];
    expect(data.map((d) => d.userId)).toEqual(["a"]);
  });

  it("writes nothing when every member opted out", async () => {
    vi.mocked(db.workspaceMember.findMany).mockResolvedValue([{ userId: "a" }] as never);
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "a" }] as never);
    await notifyWorkspace("w1", n);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});
