import { describe, it, expect } from "vitest";
import {
  validateFeedback,
  feedbackSubject,
  feedbackBody,
  sanitizeContext,
  FIELD_MAX,
} from "./feedback";

const ok = { goal: "Schedule a post to Instagram", problem: "The publish button did nothing" };

describe("validateFeedback", () => {
  it("accepts a filled-in report", () => {
    expect(validateFeedback(ok)).toEqual([]);
  });

  it("requires both answers", () => {
    const errors = validateFeedback({ goal: "", problem: "" });
    expect(errors.map((e) => e.field)).toEqual(["goal", "problem"]);
  });

  it("treats whitespace as empty", () => {
    // Otherwise a form full of spaces passes the client and lands as a blank
    // ticket someone has to triage.
    expect(validateFeedback({ goal: "   ", problem: "\n\t " })).toHaveLength(2);
  });

  it("reports every problem at once rather than one at a time", () => {
    expect(validateFeedback({ goal: "", problem: "x".repeat(FIELD_MAX + 1) })).toHaveLength(2);
  });

  it("enforces the same cap the counter shows", () => {
    expect(validateFeedback({ ...ok, goal: "x".repeat(FIELD_MAX) })).toEqual([]);
    expect(validateFeedback({ ...ok, goal: "x".repeat(FIELD_MAX + 1) })).toHaveLength(1);
  });
});

describe("feedbackSubject", () => {
  it("is built from the goal, not the complaint", () => {
    expect(feedbackSubject(ok.goal)).toBe("Feedback: Schedule a post to Instagram");
  });

  it("truncates a long goal to stay scannable", () => {
    const s = feedbackSubject("x".repeat(200));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("…")).toBe(true);
  });

  it("collapses newlines so the queue stays one line per ticket", () => {
    expect(feedbackSubject("post\n\n  to   Instagram")).toBe("Feedback: post to Instagram");
  });
});

describe("feedbackBody", () => {
  it("keeps both answers and labels which is which", () => {
    const body = feedbackBody(ok);
    expect(body).toContain(ok.goal);
    expect(body).toContain(ok.problem);
    expect(body).toContain("What they were trying to do:");
    expect(body).toContain("What got in their way:");
  });
});

describe("sanitizeContext", () => {
  it("keeps an in-app path", () => {
    expect(sanitizeContext("/composer/abc123")).toBe("/composer/abc123");
  });

  it("drops anything that isn't a path", () => {
    // Comes from the browser and is rendered in the admin queue, so an
    // absolute URL is not stored.
    expect(sanitizeContext("https://evil.example/x")).toBeNull();
    expect(sanitizeContext("javascript:alert(1)")).toBeNull();
    expect(sanitizeContext("//evil.example")).toBeNull();
    expect(sanitizeContext("")).toBeNull();
    expect(sanitizeContext(null)).toBeNull();
  });

  it("caps the length", () => {
    expect(sanitizeContext(`/${"a".repeat(500)}`)!.length).toBe(200);
  });
});
