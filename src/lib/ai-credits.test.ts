import { describe, it, expect } from "vitest";
import { affordable } from "./ai-credits";

/**
 * The AI credit budget was a tripwire, not a ceiling: it refused only once
 * usage had already reached the plan limit, so an org one credit short of its
 * cap could ask for 50 captions and be billed for all 50.
 *
 * `affordable` is what turns the remaining balance into a quantity the org can
 * actually pay for.
 */

describe("affordable", () => {
  it("grants the full request when there is room", () => {
    expect(affordable(3, 500)).toBe(3);
  });

  it("clamps a request that would overshoot the plan cap", () => {
    // The case that used to bill 50 credits against a 1-credit balance.
    expect(affordable(50, 1)).toBe(1);
  });

  it("grants exactly the balance when they match", () => {
    expect(affordable(10, 10)).toBe(10);
  });

  it("grants nothing when the balance is gone", () => {
    expect(affordable(5, 0)).toBe(0);
    expect(affordable(5, -3)).toBe(0); // over-drawn by an earlier charge
  });

  it("does not invent credits from a negative or zero request", () => {
    expect(affordable(0, 100)).toBe(0);
    expect(affordable(-2, 100)).toBe(0);
  });

  it("leaves the request alone on an unmetered plan", () => {
    // limit <= 0 means the plan does not meter AI credits; remaining is
    // Infinity and must not clamp to it.
    expect(affordable(50, Number.POSITIVE_INFINITY)).toBe(50);
    expect(affordable(0, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
