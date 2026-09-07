import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TRIGGERS, ACTIONS, MATRIX, isSupportedPair, actionsFor, usesThreshold, TRIGGER_LABEL, ACTION_LABEL } from "./automations";

/**
 * The form used to offer 5 triggers × 4 actions while the engine implemented
 * 3 pairs. The other 17 saved fine and then never ran — the card said
 * "never run" forever with nothing explaining why.
 *
 * These tests hold the matrix and the engine together.
 */

const ENGINE = readFileSync(new URL("./adapters/automations.ts", import.meta.url), "utf8");

describe("automation matrix", () => {
  it("offers at least one action for every trigger", () => {
    for (const t of TRIGGERS) {
      expect(actionsFor(t).length, `${t} has no actions`).toBeGreaterThan(0);
    }
  });

  it("every offered pair is handled by the engine", () => {
    // Each supported action must appear as a branch in the engine source. A
    // pair added to MATRIX with no implementation is exactly the bug this
    // whole table exists to stop, so it must fail here, not in production.
    for (const [trigger, actions] of Object.entries(MATRIX)) {
      expect(ENGINE, `engine has no branch for trigger ${trigger}`).toContain(`a.triggerType === "${trigger}"`);
      for (const action of actions) {
        expect(ENGINE, `engine has no branch for ${trigger} → ${action}`).toContain(
          `a.actionType === "${action}"`,
        );
      }
    }
  });

  it("every trigger and action has a human label", () => {
    for (const t of TRIGGERS) expect(TRIGGER_LABEL[t], t).toBeTruthy();
    for (const a of ACTIONS) expect(ACTION_LABEL[a], a).toBeTruthy();
  });

  it("keeps labels for retired options so old rows still read sensibly", () => {
    expect(TRIGGER_LABEL.threshold_reached).toBeTruthy();
    expect(ACTION_LABEL.assign).toBeTruthy();
  });
});

describe("isSupportedPair", () => {
  it("accepts the pairs the engine implements", () => {
    expect(isSupportedPair("post_published", "notify")).toBe(true);
    expect(isSupportedPair("high_engagement", "tag_high_performer")).toBe(true);
    expect(isSupportedPair("draft_created", "run_ai_optimize")).toBe(true);
    expect(isSupportedPair("approval_requested", "notify")).toBe(true);
  });

  it("rejects combinations that would never run", () => {
    // Nonsense pairings the old form happily accepted.
    expect(isSupportedPair("approval_requested", "run_ai_optimize")).toBe(false);
    expect(isSupportedPair("draft_created", "tag_high_performer")).toBe(false);
    expect(isSupportedPair("post_published", "run_ai_optimize")).toBe(false);
  });

  it("rejects retired triggers and actions", () => {
    expect(isSupportedPair("threshold_reached", "notify")).toBe(false);
    expect(isSupportedPair("post_published", "assign")).toBe(false);
  });

  it("rejects unknown input rather than throwing", () => {
    expect(isSupportedPair("", "")).toBe(false);
    expect(isSupportedPair("__proto__", "notify")).toBe(false);
    expect(actionsFor("nope")).toEqual([]);
  });
});

describe("usesThreshold", () => {
  it("only the engagement trigger reads one", () => {
    expect(usesThreshold("high_engagement")).toBe(true);
    for (const t of TRIGGERS.filter((t) => t !== "high_engagement")) {
      expect(usesThreshold(t), t).toBe(false);
    }
  });
});
