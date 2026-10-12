import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: { killSwitch: { findMany: vi.fn() } } }));

import { db } from "@/lib/db";
import { PAUSED_MESSAGE, applies, invalidateKillSwitches, isLive, pausedMessage, type SwitchRow } from "./kill-switches";

const NOW = new Date("2026-10-09T12:00:00Z");
const sw = (over: Partial<SwitchRow> = {}): SwitchRow => ({ id: "k1", kind: "publishing", scopeType: "platform", scopeValue: null, expiresAt: null, revokedAt: null, ...over });

describe("isLive", () => {
  it("is live until revoked or expired", () => {
    expect(isLive(sw(), NOW)).toBe(true);
    expect(isLive(sw({ revokedAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(false);
    expect(isLive(sw({ expiresAt: new Date(NOW.getTime() + 1000) }), NOW)).toBe(true);
    expect(isLive(sw({ expiresAt: NOW }), NOW)).toBe(false);
    expect(isLive(sw({ expiresAt: new Date(NOW.getTime() - 1000) }), NOW)).toBe(false);
  });
});

describe("applies", () => {
  it("a platform switch pauses everyone, of its own kind only", () => {
    expect(applies(sw(), "publishing", {}, NOW)).toBe(true);
    expect(applies(sw(), "ai", {}, NOW)).toBe(false);
  });
  it("an org switch pauses only that org", () => {
    const s = sw({ scopeType: "org", scopeValue: "org1" });
    expect(applies(s, "publishing", { orgId: "org1" }, NOW)).toBe(true);
    expect(applies(s, "publishing", { orgId: "org2" }, NOW)).toBe(false);
    expect(applies(s, "publishing", {}, NOW)).toBe(false);
  });
  it("a provider switch pauses only work that involves that provider", () => {
    const s = sw({ scopeType: "provider", scopeValue: "instagram" });
    expect(applies(s, "publishing", { providers: ["facebook", "instagram"] }, NOW)).toBe(true);
    expect(applies(s, "publishing", { providers: ["facebook"] }, NOW)).toBe(false);
    expect(applies(s, "publishing", {}, NOW)).toBe(false);
  });
  it("a switch with a missing scope value, an unknown scope type, or that has ended, applies to nothing", () => {
    expect(applies(sw({ scopeType: "org", scopeValue: null }), "publishing", { orgId: "x" }, NOW)).toBe(false);
    expect(applies(sw({ scopeType: "region" }), "publishing", { orgId: "x" }, NOW)).toBe(false);
    expect(applies(sw({ revokedAt: NOW }), "publishing", {}, NOW)).toBe(false);
  });
});

describe("pausedMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateKillSwitches();
    vi.mocked(db.killSwitch.findMany).mockResolvedValue([] as never);
  });

  it("is null when nothing is paused, and never looks up the organization", async () => {
    const orgId = vi.fn(async () => "org1");
    expect(await pausedMessage("ai", { orgId, providers: ["openai"] }, NOW)).toBeNull();
    expect(orgId).not.toHaveBeenCalled();
  });

  it("gives the customer-facing text, never the internal reason", async () => {
    vi.mocked(db.killSwitch.findMany).mockResolvedValue([sw({ kind: "ai", scopeType: "provider", scopeValue: "openai" })] as never);
    expect(await pausedMessage("ai", { providers: ["openai"] }, NOW)).toBe(PAUSED_MESSAGE.ai);
    expect(await pausedMessage("ai", { providers: ["gemini"] }, NOW)).toBeNull();
  });

  it("only resolves the organization when an org-scoped switch exists", async () => {
    vi.mocked(db.killSwitch.findMany).mockResolvedValue([sw({ scopeType: "org", scopeValue: "org1" })] as never);
    const orgId = vi.fn(async () => "org1");
    expect(await pausedMessage("publishing", { orgId }, NOW)).toBe(PAUSED_MESSAGE.publishing);
    expect(orgId).toHaveBeenCalledTimes(1);
    expect(await pausedMessage("publishing", { orgId: async () => "other" }, NOW)).toBeNull();
  });

  it("a failing organization lookup means not paused rather than an error", async () => {
    vi.mocked(db.killSwitch.findMany).mockResolvedValue([sw({ scopeType: "org", scopeValue: "org1" })] as never);
    expect(await pausedMessage("publishing", { orgId: async () => { throw new Error("db"); } }, NOW)).toBeNull();
  });

  it("caches briefly, and invalidation takes effect at once", async () => {
    await pausedMessage("ai", {}, NOW);
    await pausedMessage("ai", {}, new Date(NOW.getTime() + 5000));
    expect(db.killSwitch.findMany).toHaveBeenCalledTimes(1);
    await pausedMessage("ai", {}, new Date(NOW.getTime() + 20_000));
    expect(db.killSwitch.findMany).toHaveBeenCalledTimes(2);
    invalidateKillSwitches();
    await pausedMessage("ai", {}, new Date(NOW.getTime() + 21_000));
    expect(db.killSwitch.findMany).toHaveBeenCalledTimes(3);
  });

  it("if the table cannot be read, keeps the last known state; with none, pauses nothing", async () => {
    vi.mocked(db.killSwitch.findMany).mockRejectedValue(new Error("relation does not exist"));
    expect(await pausedMessage("publishing", {}, NOW)).toBeNull();
    vi.mocked(db.killSwitch.findMany).mockResolvedValue([sw()] as never);
    invalidateKillSwitches();
    expect(await pausedMessage("publishing", {}, NOW)).toBe(PAUSED_MESSAGE.publishing);
    vi.mocked(db.killSwitch.findMany).mockRejectedValue(new Error("db down"));
    expect(await pausedMessage("publishing", {}, new Date(NOW.getTime() + 60_000))).toBe(PAUSED_MESSAGE.publishing);
  });
});
