import { describe, expect, it } from "vitest";
import { DURATION, EASE, cardEnter, modalEnter, staggerDelay } from "./motion";

describe("motion system", () => {
  it("keeps the three speeds ordered and fast", () => {
    expect(DURATION.micro).toBeLessThan(DURATION.standard);
    expect(DURATION.standard).toBeLessThan(DURATION.large);
    expect(DURATION.large).toBeLessThanOrEqual(0.5); // nothing in the UI should feel slow
    expect(EASE).toHaveLength(4);
  });

  it("caps stagger so a long list never makes the user wait", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBeCloseTo(0.15);
    expect(staggerDelay(500)).toBeCloseTo(0.4);
    expect(staggerDelay(-2)).toBe(0);
  });

  it("only animates GPU-friendly properties and keeps entrances subtle", () => {
    const keys = (v: Record<string, unknown>) => Object.keys(v).filter((k) => k !== "transition");
    const allowed = new Set(["opacity", "y", "x", "scale"]);
    for (const v of [cardEnter.hidden, cardEnter.show, modalEnter.hidden, modalEnter.show, modalEnter.exit]) {
      for (const k of keys(v)) expect(allowed.has(k), k).toBe(true);
    }
    expect(Math.abs(cardEnter.hidden.y)).toBeLessThanOrEqual(12);
    expect(cardEnter.hidden.scale).toBeGreaterThanOrEqual(0.95);
  });
});
