import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetPlatformRuleAction, updatePlatformRuleAction } from "./platform-rules";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { requirePlatformAdmin } from "@/lib/session";
import { invalidatePlatformRules } from "@/lib/platform-rules-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/session", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/platform-rules-db", async (orig) => ({
  ...(await orig<typeof import("@/lib/platform-rules-db")>()),
  invalidatePlatformRules: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    platformRule: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    platformRuleRevision: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

const ADMIN = { id: "admin_1" };
const NOT_ADMIN = new Error("NEXT_REDIRECT");
const ID = "instagram.hashtags.max";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue(ADMIN as never);
  vi.mocked(db.platformRule.findUnique).mockResolvedValue(null as never);
  vi.mocked(db.$transaction).mockImplementation((async (ops: unknown[]) => ops) as never);
});

describe("admin-only", () => {
  it.each([
    ["update", () => updatePlatformRuleAction({ id: ID, value: 6, reason: "platform changed" })],
    ["reset", () => resetPlatformRuleAction(ID, "platform changed")],
  ])("%s is refused for a non-admin and writes nothing", async (_n, run) => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(NOT_ADMIN);
    await expect(run()).rejects.toBe(NOT_ADMIN);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("updatePlatformRuleAction", () => {
  it("rejects a missing reason, a bad url, a bad version, an unknown rule and a no-op", async () => {
    expect(await updatePlatformRuleAction({ id: ID, value: 6, reason: "" })).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect(await updatePlatformRuleAction({ id: ID, sourceUrl: "http://x.com", reason: "because" })).toMatchObject({ ok: false, fieldErrors: { sourceUrl: expect.any(String) } });
    expect(await updatePlatformRuleAction({ id: ID, version: "Oct", reason: "because" })).toMatchObject({ ok: false });
    expect(await updatePlatformRuleAction({ id: "nope.nope", value: 1, reason: "because" })).toEqual({ ok: false, error: "Unknown rule" });
    expect(await updatePlatformRuleAction({ id: ID, value: 5, reason: "same as default" })).toEqual({ ok: false, error: "Nothing changed" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("writes the override, a revision with old/new, an audit entry, and invalidates the cache", async () => {
    const res = await updatePlatformRuleAction({ id: ID, value: 6, version: "2026-11", sourceName: "Instagram Help", sourceUrl: "https://help.instagram.com/x", reason: "Instagram raised the limit" });
    expect(res).toEqual({ ok: true, message: "Rule updated" });

    const upsert = vi.mocked(db.platformRule.upsert).mock.calls[0][0];
    expect(upsert.where).toEqual({ id: ID });
    expect(upsert.create).toMatchObject({ id: ID, platform: "instagram", value: 6, version: "2026-11", updatedBy: "admin_1" });

    const rev = vi.mocked(db.platformRuleRevision.create).mock.calls[0][0].data;
    expect(rev).toMatchObject({ ruleId: ID, platform: "instagram", changedBy: "admin_1", reason: "Instagram raised the limit", version: "2026-11" });
    expect(JSON.parse(rev.oldValue)).toMatchObject({ value: 5, kind: "HARD_LIMIT" });
    expect(JSON.parse(rev.newValue)).toMatchObject({ value: 6, version: "2026-11" });

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin_1", action: "admin.platform_rule_updated", targetType: "platform_rule", targetId: ID }),
    );
    expect(invalidatePlatformRules).toHaveBeenCalled();
  });

  it("keeps earlier overrides when changing a different field", async () => {
    vi.mocked(db.platformRule.findUnique).mockResolvedValue({ id: ID, value: 8, enabled: null, kind: null, sourceName: null, sourceUrl: null, version: null, verification: null, lastVerifiedAt: null } as never);
    await updatePlatformRuleAction({ id: ID, enabled: false, reason: "pause this rule" });
    const create = vi.mocked(db.platformRule.upsert).mock.calls[0][0].update;
    expect(create).toMatchObject({ value: 8, enabled: false });
  });

  it("marks verification with today's date", async () => {
    await updatePlatformRuleAction({ id: ID, markVerified: true, version: "2026-12", reason: "re-checked the docs" });
    const create = vi.mocked(db.platformRule.upsert).mock.calls[0][0].create;
    expect(create.lastVerifiedAt).toBeInstanceOf(Date);
  });
});

describe("resetPlatformRuleAction", () => {
  it("needs a reason and an existing override", async () => {
    expect(await resetPlatformRuleAction(ID, "x")).toMatchObject({ ok: false });
    expect(await resetPlatformRuleAction(ID, "back to default")).toEqual({ ok: false, error: "This rule already uses its default" });
  });
  it("deletes the override, records the revision and audits it", async () => {
    vi.mocked(db.platformRule.findUnique).mockResolvedValue({ id: ID, value: 9, enabled: null, kind: null, sourceName: null, sourceUrl: null, version: null, verification: null, lastVerifiedAt: null } as never);
    const res = await resetPlatformRuleAction(ID, "mistake, restoring default");
    expect(res).toEqual({ ok: true, message: "Rule reset to default" });
    expect(db.platformRule.delete).toHaveBeenCalledWith({ where: { id: ID } });
    const rev = vi.mocked(db.platformRuleRevision.create).mock.calls[0][0].data;
    expect(JSON.parse(rev.oldValue).value).toBe(9);
    expect(JSON.parse(rev.newValue).value).toBe(5);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.platform_rule_reset" }));
  });
});
