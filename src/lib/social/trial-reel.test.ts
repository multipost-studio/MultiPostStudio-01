import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { clearTrialReelRefusal, markTrialReelRefused, readTrialRefusal, usedTrialReel } from "./trial-reel";

vi.mock("@/lib/db", () => ({ db: { socialAccount: { findUnique: vi.fn(), update: vi.fn() } } }));

const NOW = Date.parse("2026-11-10T12:00:00Z");
const meta = (m: object) => JSON.stringify(m);

describe("readTrialRefusal", () => {
  it("returns a recent refusal Instagram sent", () => {
    expect(readTrialRefusal(meta({ trialReelRefused: { at: "2026-11-08T12:00:00Z", reason: "Not eligible" } }), NOW)).toEqual({ at: "2026-11-08T12:00:00Z", reason: "Not eligible" });
  });

  it("stops showing it after a week, and ignores anything malformed or from the future", () => {
    expect(readTrialRefusal(meta({ trialReelRefused: { at: "2026-11-01T12:00:00Z", reason: "x" } }), NOW)).toBeNull();
    expect(readTrialRefusal(meta({ trialReelRefused: { at: "2027-01-01T00:00:00Z", reason: "x" } }), NOW)).toBeNull();
    expect(readTrialRefusal(meta({ trialReelRefused: { at: "nope", reason: "x" } }), NOW)).toBeNull();
    expect(readTrialRefusal(meta({ trialReelRefused: "x" }), NOW)).toBeNull();
    for (const raw of [null, undefined, "", "not json", "[]"]) expect(readTrialRefusal(raw, NOW)).toBeNull();
  });
});

describe("usedTrialReel", () => {
  it("is true only when a trial mode was chosen", () => {
    expect(usedTrialReel(meta({ igTrial: "manual" }))).toBe(true);
    expect(usedTrialReel(meta({ igTrial: "auto" }))).toBe(true);
    expect(usedTrialReel(meta({ igTrial: "" }))).toBe(false);
    expect(usedTrialReel(null)).toBe(false);
  });
});

describe("saving and clearing", () => {
  beforeEach(() => {
    vi.mocked(db.socialAccount.findUnique).mockReset();
    vi.mocked(db.socialAccount.update).mockReset().mockResolvedValue({} as never);
  });
  const savedMeta = () => JSON.parse((vi.mocked(db.socialAccount.update).mock.calls[0][0].data as { metadata: string }).metadata);

  it("records the refusal next to what the account already stores", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue({ metadata: meta({ remoteId: "1784", igLogin: true }) } as never);
    await markTrialReelRefused("a1", "Instagram refused this as a trial reel.");
    const saved = savedMeta();
    expect(saved).toMatchObject({ remoteId: "1784", igLogin: true, trialReelRefused: { reason: "Instagram refused this as a trial reel." } });
    expect(Date.parse(saved.trialReelRefused.at)).toBeGreaterThan(Date.now() - 5000);
  });

  it("clears only that key", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue({ metadata: meta({ remoteId: "1784", trialReelRefused: { at: "2026-11-08T12:00:00Z", reason: "x" } }) } as never);
    await clearTrialReelRefusal("a1");
    expect(savedMeta()).toEqual({ remoteId: "1784" });
  });

  it("writes nothing when there is nothing to clear", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue({ metadata: meta({ remoteId: "1784" }) } as never);
    await clearTrialReelRefusal("a1");
    expect(db.socialAccount.update).not.toHaveBeenCalled();
  });
});
