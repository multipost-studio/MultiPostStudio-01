import { describe, it, expect, vi, beforeEach } from "vitest";
import { CHIMES, MIN_GAP_MS, chimeFor, gainFor, playNotificationSound, resetSoundForTests, unlockAudio } from "./sound";

type FakeState = "running" | "suspended";

function installAudio(initial: FakeState, resumeWorks = true) {
  const started: { freq: number; start: number }[] = [];
  const created = { contexts: 0 };
  class FakeContext {
    state: FakeState = initial;
    currentTime = 10;
    destination = {};
    constructor() {
      created.contexts++;
    }
    resume = vi.fn(async () => {
      if (!resumeWorks) throw new Error("not allowed without a gesture");
      this.state = "running";
    });
    createGain() {
      return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    }
    createOscillator() {
      const o = { type: "", frequency: { value: 0 }, connect: vi.fn(), start: (t: number) => started.push({ freq: o.frequency.value, start: t }), stop: vi.fn() };
      return o;
    }
  }
  vi.stubGlobal("window", { AudioContext: FakeContext });
  return { started, created };
}

beforeEach(() => {
  resetSoundForTests();
  vi.unstubAllGlobals();
});

describe("chime design", () => {
  it("critical notifications get the three-note alert, everything else the two-note chime", () => {
    expect(chimeFor(["normal", "low"])).toBe("default");
    expect(chimeFor([])).toBe("default");
    expect(chimeFor(["normal", "critical"])).toBe("alert");
    expect(CHIMES.default).toHaveLength(2);
    expect(CHIMES.alert).toHaveLength(3);
  });

  it("volume maps to a deliberately quiet output level and is clamped", () => {
    expect(gainFor(0)).toBe(0);
    expect(gainFor(100)).toBeCloseTo(0.22);
    expect(gainFor(50)).toBeCloseTo(0.11);
    expect(gainFor(-10)).toBe(0);
    expect(gainFor(500)).toBeCloseTo(0.22);
    expect(gainFor(NaN)).toBe(0);
  });
});

describe("playNotificationSound", () => {
  it("plays every note of the chime, at the right pitches, when audio is allowed", () => {
    const { started } = installAudio("running");
    expect(playNotificationSound(60, "default", { now: 5000 })).toBe(true);
    expect(started.map((s) => s.freq)).toEqual(CHIMES.default.map((n) => n.freq));
  });

  it("plays the alert for critical", () => {
    const { started } = installAudio("running");
    playNotificationSound(60, "alert", { now: 5000 });
    expect(started).toHaveLength(3);
  });

  it("stays silent when muted (volume 0)", () => {
    const { started, created } = installAudio("running");
    expect(playNotificationSound(0, "default", { now: 5000 })).toBe(false);
    expect(started).toHaveLength(0);
    expect(created.contexts).toBe(0);
  });

  it("a burst makes one sound, not a ring; a sample button can override that", () => {
    const { started } = installAudio("running");
    expect(playNotificationSound(60, "default", { now: 10_000 })).toBe(true);
    expect(playNotificationSound(60, "default", { now: 10_000 + MIN_GAP_MS - 1 })).toBe(false);
    expect(started).toHaveLength(2);
    expect(playNotificationSound(60, "default", { now: 10_000 + MIN_GAP_MS - 1, force: true })).toBe(true);
    expect(playNotificationSound(60, "default", { now: 10_000 + MIN_GAP_MS * 3 })).toBe(true);
  });

  it("waits for the browser to allow sound, then plays", async () => {
    const { started } = installAudio("suspended");
    expect(playNotificationSound(60, "default", { now: 5000 })).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toHaveLength(2);
  });

  it("is silent, and never throws, when the browser refuses sound before any tap", async () => {
    const { started } = installAudio("suspended", false);
    expect(() => playNotificationSound(60, "default", { now: 5000 })).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toHaveLength(0);
  });

  it("does nothing, without throwing, where there is no audio support or no window", () => {
    vi.stubGlobal("window", {});
    expect(playNotificationSound(60)).toBe(false);
    vi.unstubAllGlobals();
    expect(() => unlockAudio()).not.toThrow();
  });

  it("unlockAudio resumes a suspended context so later chimes can play", () => {
    installAudio("suspended");
    expect(() => unlockAudio()).not.toThrow();
  });
});
