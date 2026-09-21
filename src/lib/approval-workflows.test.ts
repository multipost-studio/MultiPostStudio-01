import { describe, it, expect } from "vitest";
import {
  REVISION_REASONS,
  getRevisionReason,
  getRevisionReasonLabel,
  calculateStageSla,
  formatTimelineActions,
} from "./approval-workflows";

describe("approval-workflows domain logic", () => {
  describe("revision reasons", () => {
    it("defines standard revision reason keys", () => {
      const keys = REVISION_REASONS.map((r) => r.key);
      expect(keys).toContain("copy_edit");
      expect(keys).toContain("brand_voice");
      expect(keys).toContain("media_assets");
      expect(keys).toContain("legal_compliance");
      expect(keys).toContain("timing_strategy");
      expect(keys).toContain("other");
    });

    it("retrieves valid revision reasons by key", () => {
      const copyEdit = getRevisionReason("copy_edit");
      expect(copyEdit).not.toBeNull();
      expect(copyEdit?.label).toBe("Copy & Typo");
      expect(copyEdit?.badgeTone).toBe("info");

      const brandVoice = getRevisionReason("brand_voice");
      expect(brandVoice?.badgeTone).toBe("warning");

      expect(getRevisionReason("invalid_reason")).toBeNull();
      expect(getRevisionReason(null)).toBeNull();
    });

    it("formats fallback labels cleanly", () => {
      expect(getRevisionReasonLabel("copy_edit")).toBe("Copy & Typo");
      expect(getRevisionReasonLabel("custom_reason")).toBe("custom reason");
      expect(getRevisionReasonLabel(null)).toBe("Changes requested");
    });
  });

  describe("calculateStageSla", () => {
    const NOW = 1700000000000; // Fixed timestamp for deterministic testing

    it("returns hasSla: false if stageEnteredAt or timeoutHours missing", () => {
      expect(calculateStageSla(null, 12, null, null, NOW).hasSla).toBe(false);
      expect(calculateStageSla(new Date(NOW), null, null, null, NOW).hasSla).toBe(false);
      expect(calculateStageSla(new Date(NOW), 0, null, null, NOW).hasSla).toBe(false);
    });

    it("calculates active SLA when comfortably within time limit", () => {
      // 10 hours limit, entered 2 hours ago -> 8 hours left
      const enteredAt = new Date(NOW - 2 * 3600 * 1000);
      const sla = calculateStageSla(enteredAt, 10, "escalate", "admin", NOW);

      expect(sla.hasSla).toBe(true);
      expect(sla.isOverdue).toBe(false);
      expect(sla.hoursLeft).toBe(8);
      expect(sla.statusLevel).toBe("normal");
      expect(sla.timeoutAction).toBe("escalate");
      expect(sla.escalateToRole).toBe("admin");
      expect(sla.formattedTimeLeft).toContain("8h 0m left");
    });

    it("flags warning status when under 6 hours remaining", () => {
      // 10 hours limit, entered 6 hours ago -> 4 hours left
      const enteredAt = new Date(NOW - 6 * 3600 * 1000);
      const sla = calculateStageSla(enteredAt, 10, "reject", null, NOW);

      expect(sla.isOverdue).toBe(false);
      expect(sla.statusLevel).toBe("warning");
      expect(sla.hoursLeft).toBe(4);
    });

    it("flags critical status when under 2 hours remaining", () => {
      // 10 hours limit, entered 9 hours ago -> 1 hour left
      const enteredAt = new Date(NOW - 9 * 3600 * 1000);
      const sla = calculateStageSla(enteredAt, 10, "auto_approve", null, NOW);

      expect(sla.isOverdue).toBe(false);
      expect(sla.statusLevel).toBe("critical");
      expect(sla.hoursLeft).toBe(1);
    });

    it("flags overdue status and calculates overdue duration", () => {
      // 10 hours limit, entered 13 hours ago -> 3 hours overdue
      const enteredAt = new Date(NOW - 13 * 3600 * 1000);
      const sla = calculateStageSla(enteredAt, 10, "escalate", "owner", NOW);

      expect(sla.hasSla).toBe(true);
      expect(sla.isOverdue).toBe(true);
      expect(sla.statusLevel).toBe("overdue");
      expect(sla.hoursLeft).toBe(-3);
      expect(sla.formattedTimeLeft).toContain("3h 0m overdue");
    });
  });

  describe("formatTimelineActions", () => {
    it("formats approval, changes requested, and resubmit actions properly", () => {
      const rawActions = [
        {
          id: "act-1",
          action: "request_changes",
          comment: "Please revise the hook to be more engaging.",
          actor: { name: "Alice Manager" },
          actorLabel: null,
          reasonCategory: "brand_voice",
          createdAt: new Date("2026-09-20T10:00:00Z"),
        },
        {
          id: "act-2",
          action: "resubmit",
          comment: "Rewrote the hook as requested.",
          actor: { name: "Bob Creator" },
          actorLabel: null,
          reasonCategory: null,
          createdAt: new Date("2026-09-20T11:00:00Z"),
        },
        {
          id: "act-3",
          action: "approve",
          comment: "Looks great now!",
          actor: null,
          actorLabel: "Client Portal (Acme)",
          reasonCategory: null,
          createdAt: new Date("2026-09-20T12:00:00Z"),
        },
      ];

      const timeline = formatTimelineActions(rawActions);
      expect(timeline).toHaveLength(3);

      expect(timeline[0].actor).toBe("Alice Manager");
      expect(timeline[0].formattedAction).toBe("requested changes");
      expect(timeline[0].reasonCategory).toBe("brand_voice");
      expect(timeline[0].reasonDef?.badgeTone).toBe("warning");

      expect(timeline[1].actor).toBe("Bob Creator");
      expect(timeline[1].formattedAction).toBe("resubmitted revised post");

      expect(timeline[2].actor).toBe("Client Portal (Acme)");
      expect(timeline[2].formattedAction).toBe("approved stage");
    });
  });
});
