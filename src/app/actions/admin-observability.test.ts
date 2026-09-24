import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  clearSystemEventsAction,
  deleteSystemEventAction,
  purgeOldSystemEventsAction,
} from "./admin-observability";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";

vi.mock("@/lib/session", () => ({
  requirePlatformAdmin: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    systemEvent: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("Admin Observability Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePlatformAdmin).mockResolvedValue({
      id: "admin_1",
      email: "admin@test.com",
    } as unknown as Awaited<ReturnType<typeof requirePlatformAdmin>>);
  });

  describe("clearSystemEventsAction", () => {
    it("purges all error events when onlyErrors and clearAll are set", async () => {
      vi.mocked(db.systemEvent.deleteMany).mockResolvedValue({ count: 4 });

      const res = await clearSystemEventsAction({ clearAll: true, onlyErrors: true });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toBe(4);
        expect(res.message).toContain("critical error");
      }
      expect(db.systemEvent.deleteMany).toHaveBeenCalledWith({
        where: { level: "error" },
      });
    });

    it("purges all events when clearAll is true without onlyErrors", async () => {
      vi.mocked(db.systemEvent.deleteMany).mockResolvedValue({ count: 10 });

      const res = await clearSystemEventsAction({ clearAll: true });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toBe(10);
      }
      expect(db.systemEvent.deleteMany).toHaveBeenCalledWith({
        where: {},
      });
    });

    it("purges events older than specified hours", async () => {
      vi.mocked(db.systemEvent.deleteMany).mockResolvedValue({ count: 3 });

      const res = await clearSystemEventsAction({ olderThanHours: 24 });

      expect(res.ok).toBe(true);
      expect(db.systemEvent.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              lt: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it("falls back to default 30 days via purgeOldSystemEventsAction", async () => {
      vi.mocked(db.systemEvent.deleteMany).mockResolvedValue({ count: 1 });

      const res = await purgeOldSystemEventsAction();

      expect(res.ok).toBe(true);
      expect(db.systemEvent.deleteMany).toHaveBeenCalled();
    });
  });

  describe("deleteSystemEventAction", () => {
    it("deletes a single event by id", async () => {
      vi.mocked(db.systemEvent.deleteMany).mockResolvedValue({ count: 1 });

      const res = await deleteSystemEventAction("event_123");

      expect(res.ok).toBe(true);
      expect(db.systemEvent.deleteMany).toHaveBeenCalledWith({
        where: { id: "event_123" },
      });
    });

    it("fails when id is empty", async () => {
      const res = await deleteSystemEventAction("");

      expect(res.ok).toBe(false);
      expect(db.systemEvent.deleteMany).not.toHaveBeenCalled();
    });
  });
});
