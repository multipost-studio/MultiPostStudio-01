import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminPermission: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    backupCheck: { create: vi.fn() },
    policyVersion: { create: vi.fn() },
  },
}));

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { requireAdminPermission } from "@/lib/session";
import { recordBackupCheckAction } from "./admin-recovery";
import { publishPolicyVersionAction } from "./admin-policies";

const today = () => new Date().toISOString().slice(0, 10);
const daysFromToday = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: "s1" } as never);
  vi.mocked(db.backupCheck.create).mockResolvedValue({ id: "b1" } as never);
  vi.mocked(db.policyVersion.create).mockResolvedValue({ id: "p1" } as never);
});

describe("recordBackupCheckAction", () => {
  it("needs system.manage", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(recordBackupCheckAction({ kind: "backup", result: "ok", occurredOn: today() })).rejects.toThrow("NEXT_REDIRECT");
    expect(requireAdminPermission).toHaveBeenCalledWith("system.manage");
    expect(db.backupCheck.create).not.toHaveBeenCalled();
  });

  it("records who, what, when, and audits it", async () => {
    expect(await recordBackupCheckAction({ kind: "restore_test", result: "ok", occurredOn: "2026-10-01", notes: "  Restored to staging in 14 min  " })).toMatchObject({ ok: true });
    expect(db.backupCheck.create).toHaveBeenCalledWith(expect.objectContaining({ data: { kind: "restore_test", result: "ok", occurredAt: new Date("2026-10-01T00:00:00Z"), notes: "Restored to staging in 14 min", recordedById: "s1" } }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.backup_check_recorded", targetId: "b1" }));
  });

  it("a failed check must say what went wrong", async () => {
    expect(await recordBackupCheckAction({ kind: "backup", result: "failed", occurredOn: today() })).toMatchObject({ ok: false });
    expect(await recordBackupCheckAction({ kind: "backup", result: "failed", occurredOn: today(), notes: "Snapshot missing for Oct 7" })).toMatchObject({ ok: true });
  });

  it("rejects the future, nonsense dates, unknown kinds and results, and oversized notes", async () => {
    for (const bad of [
      { kind: "backup", result: "ok", occurredOn: daysFromToday(2) },
      { kind: "backup", result: "ok", occurredOn: "2026-02-30" },
      { kind: "backup", result: "ok", occurredOn: "2019-05-01" },
      { kind: "snapshot", result: "ok", occurredOn: today() },
      { kind: "backup", result: "maybe", occurredOn: today() },
      { kind: "backup", result: "ok", occurredOn: today(), notes: "x".repeat(1001) },
      null,
    ]) {
      expect(await recordBackupCheckAction(bad)).toMatchObject({ ok: false });
    }
    expect(db.backupCheck.create).not.toHaveBeenCalled();
  });
});

describe("publishPolicyVersionAction", () => {
  const good = { type: "privacy", version: "2.1", title: "Privacy policy", url: "/privacy", summary: "Added the new sub-processors.", effectiveOn: "2026-11-01" };

  it("needs privacy.manage", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(publishPolicyVersionAction(good)).rejects.toThrow("NEXT_REDIRECT");
    expect(requireAdminPermission).toHaveBeenCalledWith("privacy.manage");
  });

  it("publishes, records the publisher, and audits", async () => {
    expect(await publishPolicyVersionAction(good)).toMatchObject({ ok: true });
    expect(db.policyVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: { type: "privacy", version: "2.1", title: "Privacy policy", url: "/privacy", summary: "Added the new sub-processors.", effectiveAt: new Date("2026-11-01T00:00:00Z"), publishedById: "s1" } }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.policy_published", targetId: "p1" }));
  });

  it("the link is optional but never unsafe", async () => {
    expect(await publishPolicyVersionAction({ ...good, url: undefined })).toMatchObject({ ok: true });
    expect(vi.mocked(db.policyVersion.create).mock.calls[0][0].data.url).toBeNull();
    for (const url of ["javascript:alert(1)", "http://example.com", "//evil.example"]) expect(await publishPolicyVersionAction({ ...good, url })).toMatchObject({ ok: false });
    expect(db.policyVersion.create).toHaveBeenCalledTimes(1);
  });

  it("rejects bad versions, short summaries, bad dates, far-future dates and unknown types", async () => {
    for (const bad of [
      { ...good, version: "" },
      { ...good, version: "1 2" },
      { ...good, summary: "short" },
      { ...good, title: "ab" },
      { ...good, effectiveOn: "soon" },
      { ...good, effectiveOn: daysFromToday(900) },
      { ...good, type: "tos" },
      null,
    ]) {
      expect(await publishPolicyVersionAction(bad)).toMatchObject({ ok: false });
    }
    expect(db.policyVersion.create).not.toHaveBeenCalled();
  });

  it("a duplicate version number is a clear error, not a crash, and writes no audit", async () => {
    vi.mocked(db.policyVersion.create).mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    const r = await publishPolicyVersionAction(good);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/already published/);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("an unexpected database error is not swallowed", async () => {
    vi.mocked(db.policyVersion.create).mockRejectedValue(new Error("connection lost"));
    await expect(publishPolicyVersionAction(good)).rejects.toThrow("connection lost");
  });
});
