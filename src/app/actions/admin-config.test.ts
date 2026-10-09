import { beforeEach, describe, expect, it, vi } from "vitest";

const saves = vi.hoisted(() => ({ saveBranding: vi.fn(), resetBranding: vi.fn(), saveHealth: vi.fn(), meta: [] as unknown[] }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminAccess: vi.fn(), requireAdminPermission: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { configRevision: { findUnique: vi.fn() }, systemSetting: { findUnique: vi.fn() } } }));
vi.mock("@/lib/branding/store", () => ({ saveBranding: saves.saveBranding, resetBranding: saves.resetBranding }));
vi.mock("@/lib/branding/config", () => ({ normalizeBrandingConfig: (x: unknown) => ({ normalized: x }) }));
vi.mock("@/lib/health/config-store", () => ({ saveHealthConfig: saves.saveHealth, resetHealthConfig: vi.fn() }));
vi.mock("@/lib/health/config", () => ({ normalizeHealthConfig: (x: unknown) => x }));

import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { requireAdminAccess, requireAdminPermission } from "@/lib/session";
import { restoreConfigRevisionAction } from "./admin-config";

const REASON = "The new footer copy was wrong";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdminAccess).mockResolvedValue({ id: "s1" } as never);
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: "s1" } as never);
  vi.mocked(db.configRevision.findUnique).mockResolvedValue({ id: "r1", key: "site_branding", after: '{"name":"Old"}' } as never);
  vi.mocked(db.systemSetting.findUnique).mockResolvedValue({ value: '{"name":"New"}' } as never);
});

describe("restoreConfigRevisionAction", () => {
  it("needs staff access, then the manage permission of that particular config", async () => {
    await restoreConfigRevisionAction("r1", REASON);
    expect(requireAdminPermission).toHaveBeenCalledWith("marketing.manage");
    vi.mocked(db.configRevision.findUnique).mockResolvedValue({ id: "r2", key: "health_config", after: "{}" } as never);
    await restoreConfigRevisionAction("r2", REASON);
    expect(requireAdminPermission).toHaveBeenLastCalledWith("system.manage");
  });

  it("is refused for someone without that permission, before anything is written", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(restoreConfigRevisionAction("r1", REASON)).rejects.toThrow("NEXT_REDIRECT");
    expect(saves.saveBranding).not.toHaveBeenCalled();
  });

  it("restores through the module's own normalizer and save, and audits it with the reason", async () => {
    expect(await restoreConfigRevisionAction("r1", REASON)).toMatchObject({ ok: true });
    expect(saves.saveBranding).toHaveBeenCalledWith({ normalized: { name: "Old" } }, "s1");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.config_restored", targetId: "site_branding", metadata: { revisionId: "r1", reason: REASON } }));
  });

  it("restoring a reset version resets the config", async () => {
    vi.mocked(db.configRevision.findUnique).mockResolvedValue({ id: "r1", key: "site_branding", after: "" } as never);
    expect(await restoreConfigRevisionAction("r1", REASON)).toMatchObject({ ok: true });
    expect(saves.resetBranding).toHaveBeenCalledWith("s1");
    expect(saves.saveBranding).not.toHaveBeenCalled();
  });

  it("needs a real reason", async () => {
    for (const bad of ["", "short", undefined, null, 5]) expect(await restoreConfigRevisionAction("r1", bad)).toMatchObject({ ok: false });
    expect(saves.saveBranding).not.toHaveBeenCalled();
  });

  it("refuses an unknown version, an unknown config, a bad id, and the version that is already current", async () => {
    vi.mocked(db.configRevision.findUnique).mockResolvedValue(null as never);
    expect(await restoreConfigRevisionAction("nope", REASON)).toMatchObject({ ok: false });
    vi.mocked(db.configRevision.findUnique).mockResolvedValue({ id: "r1", key: "some_other_setting", after: "{}" } as never);
    expect(await restoreConfigRevisionAction("r1", REASON)).toMatchObject({ ok: false });
    expect(await restoreConfigRevisionAction("", REASON)).toMatchObject({ ok: false });
    vi.mocked(db.configRevision.findUnique).mockResolvedValue({ id: "r1", key: "site_branding", after: '{"name":"New"}' } as never);
    expect(await restoreConfigRevisionAction("r1", REASON)).toMatchObject({ ok: false });
    expect(saves.saveBranding).not.toHaveBeenCalled();
  });

  it("refuses a damaged saved version instead of writing it", async () => {
    vi.mocked(db.configRevision.findUnique).mockResolvedValue({ id: "r1", key: "site_branding", after: "{not json" } as never);
    expect(await restoreConfigRevisionAction("r1", REASON)).toMatchObject({ ok: false });
    expect(saves.saveBranding).not.toHaveBeenCalled();
  });

  it("reports a failed save without claiming success or auditing a restore", async () => {
    saves.saveBranding.mockRejectedValue(new Error("db down"));
    const r = await restoreConfigRevisionAction("r1", REASON);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).not.toContain("db down");
    expect(logAudit).not.toHaveBeenCalled();
  });
});
