import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminPermission: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({ createNotification: vi.fn().mockResolvedValue({ created: true }) }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    incidentRecord: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { createNotification } from "@/lib/notifications/service";
import { requireAdminPermission } from "@/lib/session";
import { updateIncidentAction } from "./admin-incidents";

const KEY = "database@2026-10-09T10:00:00.000Z";
const good = { key: KEY, title: "Database: connection refused", ownerId: "s2", status: "investigating", postmortem: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: "s1" } as never);
  vi.mocked(db.user.findUnique).mockResolvedValue({ isPlatformAdmin: true, suspendedAt: null, deletedAt: null } as never);
  vi.mocked(db.incidentRecord.findUnique).mockResolvedValue(null as never);
});

describe("updateIncidentAction", () => {
  it("needs system.manage", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(updateIncidentAction(good)).rejects.toThrow("NEXT_REDIRECT");
    expect(requireAdminPermission).toHaveBeenCalledWith("system.manage");
    expect(db.incidentRecord.upsert).not.toHaveBeenCalled();
  });

  it("creates the record on first save, assigns the owner, audits from and to, and tells the new owner", async () => {
    expect(await updateIncidentAction(good)).toMatchObject({ ok: true });
    const call = vi.mocked(db.incidentRecord.upsert).mock.calls[0][0];
    expect(call.where).toEqual({ key: KEY });
    expect(call.create).toMatchObject({ key: KEY, ownerId: "s2", status: "investigating", postmortem: null });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.incident_updated", targetType: "incident", targetId: KEY, metadata: { status: { from: null, to: "investigating" }, owner: { from: null, to: "s2" }, postmortem: "unchanged" } }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "s2" }));
  });

  it("stamps who wrote the postmortem and when, and keeps the text out of the audit log", async () => {
    await updateIncidentAction({ ...good, status: "resolved", postmortem: "  Root cause: pool exhausted by the nightly import.  " });
    const data = vi.mocked(db.incidentRecord.upsert).mock.calls[0][0].create as Record<string, unknown>;
    expect(data.postmortem).toBe("Root cause: pool exhausted by the nightly import.");
    expect(data.postmortemById).toBe("s1");
    expect(data.postmortemAt).toBeInstanceOf(Date);
    const audit = vi.mocked(logAudit).mock.calls[0][0];
    expect(audit.metadata).toMatchObject({ postmortem: "written" });
    expect(JSON.stringify(audit)).not.toContain("pool exhausted");
  });

  it("does not re-stamp an unchanged postmortem or re-notify an unchanged owner", async () => {
    vi.mocked(db.incidentRecord.findUnique).mockResolvedValue({ ownerId: "s2", status: "open", postmortem: "Same text" } as never);
    await updateIncidentAction({ ...good, postmortem: "Same text" });
    const update = vi.mocked(db.incidentRecord.upsert).mock.calls[0][0].update as Record<string, unknown>;
    expect("postmortemAt" in update).toBe(false);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("does not notify you about taking an incident yourself", async () => {
    await updateIncidentAction({ ...good, ownerId: "s1" });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("refuses an owner who is not active staff", async () => {
    for (const owner of [null, { isPlatformAdmin: false, suspendedAt: null, deletedAt: null }, { isPlatformAdmin: true, suspendedAt: new Date(), deletedAt: null }, { isPlatformAdmin: true, suspendedAt: null, deletedAt: new Date() }]) {
      vi.mocked(db.user.findUnique).mockResolvedValue(owner as never);
      expect(await updateIncidentAction(good)).toMatchObject({ ok: false });
    }
    expect(db.incidentRecord.upsert).not.toHaveBeenCalled();
  });

  it("rejects a bad key, an unknown status, an empty title and an oversized postmortem", async () => {
    for (const bad of [
      { ...good, key: "database" },
      { ...good, key: "x@y" },
      { ...good, status: "closed" },
      { ...good, title: "   " },
      { ...good, postmortem: "x".repeat(8001) },
      null,
      {},
    ]) {
      expect(await updateIncidentAction(bad)).toMatchObject({ ok: false });
    }
    expect(db.incidentRecord.upsert).not.toHaveBeenCalled();
  });

  it("an empty postmortem removes it", async () => {
    vi.mocked(db.incidentRecord.findUnique).mockResolvedValue({ ownerId: "s2", status: "resolved", postmortem: "Old" } as never);
    await updateIncidentAction({ ...good, postmortem: "   " });
    const update = vi.mocked(db.incidentRecord.upsert).mock.calls[0][0].update as Record<string, unknown>;
    expect(update).toMatchObject({ postmortem: null, postmortemAt: null, postmortemById: null });
    expect(vi.mocked(logAudit).mock.calls[0][0].metadata).toMatchObject({ postmortem: "removed" });
  });
});
