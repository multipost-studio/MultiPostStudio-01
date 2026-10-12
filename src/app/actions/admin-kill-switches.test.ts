import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminPermission: vi.fn() }));
vi.mock("@/lib/kill-switches", async (orig) => ({ ...(await orig<typeof import("@/lib/kill-switches")>()), invalidateKillSwitches: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    organization: { findFirst: vi.fn() },
    killSwitch: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { invalidateKillSwitches } from "@/lib/kill-switches";
import { requireAdminPermission } from "@/lib/session";
import { createKillSwitchAction, revokeKillSwitchAction } from "./admin-kill-switches";

const REASON = "Instagram API is down, holding posts";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: "s1" } as never);
  vi.mocked(db.killSwitch.findMany).mockResolvedValue([] as never);
  vi.mocked(db.killSwitch.create).mockResolvedValue({ id: "k1" } as never);
  vi.mocked(db.organization.findFirst).mockResolvedValue({ id: "org1" } as never);
});

describe("createKillSwitchAction", () => {
  it("needs flags.manage and a reason", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(createKillSwitchAction({ kind: "publishing", scopeType: "platform" }, REASON)).rejects.toThrow("NEXT_REDIRECT");
    expect(requireAdminPermission).toHaveBeenCalledWith("flags.manage");
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "s1" } as never);
    for (const bad of [undefined, "", "short"]) expect(await createKillSwitchAction({ kind: "publishing", scopeType: "platform" }, bad)).toMatchObject({ ok: false });
    expect(db.killSwitch.create).not.toHaveBeenCalled();
  });

  it("creates a platform-wide pause with an expiry, audits it with the reason, and clears the cache", async () => {
    const r = await createKillSwitchAction({ kind: "ai", scopeType: "platform", scopeValue: "ignored", expiresInHours: 2 }, REASON);
    expect(r).toMatchObject({ ok: true });
    const data = vi.mocked(db.killSwitch.create).mock.calls[0][0].data;
    expect(data).toMatchObject({ kind: "ai", scopeType: "platform", scopeValue: null, reason: REASON, createdById: "s1" });
    expect((data.expiresAt as Date).getTime()).toBeGreaterThan(Date.now() + 119 * 60_000);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.kill_switch_created", reason: REASON }));
    expect(invalidateKillSwitches).toHaveBeenCalled();
  });

  it("resolves an organization by slug or id to its id", async () => {
    await createKillSwitchAction({ kind: "publishing", scopeType: "org", scopeValue: "acme-inc" }, REASON);
    expect(vi.mocked(db.killSwitch.create).mock.calls[0][0].data).toMatchObject({ scopeType: "org", scopeValue: "org1" });
    vi.mocked(db.organization.findFirst).mockResolvedValue(null as never);
    expect(await createKillSwitchAction({ kind: "publishing", scopeType: "org", scopeValue: "ghost" }, REASON)).toMatchObject({ ok: false });
  });

  it("accepts only real providers for the chosen kind", async () => {
    expect(await createKillSwitchAction({ kind: "publishing", scopeType: "provider", scopeValue: "instagram" }, REASON)).toMatchObject({ ok: true });
    expect(await createKillSwitchAction({ kind: "ai", scopeType: "provider", scopeValue: "openai" }, REASON)).toMatchObject({ ok: true });
    expect(await createKillSwitchAction({ kind: "ai", scopeType: "provider", scopeValue: "instagram" }, REASON)).toMatchObject({ ok: false });
    expect(await createKillSwitchAction({ kind: "publishing", scopeType: "provider", scopeValue: "openai" }, REASON)).toMatchObject({ ok: false });
    expect(await createKillSwitchAction({ kind: "publishing", scopeType: "provider", scopeValue: "" }, REASON)).toMatchObject({ ok: false });
  });

  it("rejects unknown kinds and scopes, absurd expiries, and duplicates", async () => {
    for (const bad of [
      { kind: "billing", scopeType: "platform" },
      { kind: "ai", scopeType: "region" },
      { kind: "ai", scopeType: "platform", expiresInHours: 0 },
      { kind: "ai", scopeType: "platform", expiresInHours: 99_999 },
      null,
    ]) {
      expect(await createKillSwitchAction(bad, REASON)).toMatchObject({ ok: false });
    }
    vi.mocked(db.killSwitch.findMany).mockResolvedValue([{ kind: "ai", scopeType: "platform", scopeValue: null }] as never);
    expect(await createKillSwitchAction({ kind: "ai", scopeType: "platform" }, REASON)).toMatchObject({ ok: false });
    expect(db.killSwitch.create).not.toHaveBeenCalled();
  });

  it("refuses when there are already too many active pauses", async () => {
    vi.mocked(db.killSwitch.findMany).mockResolvedValue(Array.from({ length: 50 }, (_, i) => ({ kind: "ai", scopeType: "org", scopeValue: `o${i}` })) as never);
    expect(await createKillSwitchAction({ kind: "publishing", scopeType: "platform" }, REASON)).toMatchObject({ ok: false });
  });
});

describe("revokeKillSwitchAction", () => {
  const sw = { kind: "ai", scopeType: "platform", scopeValue: null, revokedAt: null };

  it("lifts an active pause, with a reason and an audit event", async () => {
    vi.mocked(db.killSwitch.findUnique).mockResolvedValue(sw as never);
    vi.mocked(db.killSwitch.updateMany).mockResolvedValue({ count: 1 } as never);
    expect(await revokeKillSwitchAction("k1", "Provider recovered")).toMatchObject({ ok: true });
    expect(db.killSwitch.updateMany).toHaveBeenCalledWith({ where: { id: "k1", revokedAt: null }, data: expect.objectContaining({ revokedById: "s1" }) });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.kill_switch_lifted", reason: "Provider recovered" }));
    expect(invalidateKillSwitches).toHaveBeenCalled();
  });

  it("needs a reason, a real id, and an active pause", async () => {
    expect(await revokeKillSwitchAction("k1", "x")).toMatchObject({ ok: false });
    expect(await revokeKillSwitchAction("", "Provider recovered")).toMatchObject({ ok: false });
    vi.mocked(db.killSwitch.findUnique).mockResolvedValue(null as never);
    expect(await revokeKillSwitchAction("nope", "Provider recovered")).toMatchObject({ ok: false });
    vi.mocked(db.killSwitch.findUnique).mockResolvedValue({ ...sw, revokedAt: new Date() } as never);
    expect(await revokeKillSwitchAction("k1", "Provider recovered")).toMatchObject({ ok: false });
    expect(db.killSwitch.updateMany).not.toHaveBeenCalled();
  });

  it("does not claim success when someone else lifted it first", async () => {
    vi.mocked(db.killSwitch.findUnique).mockResolvedValue(sw as never);
    vi.mocked(db.killSwitch.updateMany).mockResolvedValue({ count: 0 } as never);
    expect(await revokeKillSwitchAction("k1", "Provider recovered")).toMatchObject({ ok: false });
    expect(logAudit).not.toHaveBeenCalled();
  });
});
