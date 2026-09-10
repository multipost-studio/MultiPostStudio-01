import { describe, it, expect } from "vitest";
import { visibleMessages, queueSide, isOpenState, preview } from "./support";

/**
 * The internal-note boundary is the thing that must not break: a staff note on
 * a ticket must never reach the person who opened it.
 */

describe("visibleMessages", () => {
  it("hides internal notes and keeps everything else", () => {
    const msgs = [
      { internal: false, body: "hi" },
      { internal: true, body: "staff only — check their plan" },
      { internal: false, body: "reply" },
    ];
    expect(visibleMessages(msgs).map((m) => m.body)).toEqual(["hi", "reply"]);
  });

  it("returns everything when nothing is internal", () => {
    const msgs = [{ internal: false }, { internal: false }];
    expect(visibleMessages(msgs)).toHaveLength(2);
  });

  it("can return nothing", () => {
    expect(visibleMessages([{ internal: true }])).toEqual([]);
  });
});

describe("queueSide", () => {
  it("is 'you' for a brand-new ticket with no replies", () => {
    expect(queueSide({ status: "open", lastReplyRole: null })).toBe("you");
  });
  it("is 'you' when the customer replied last", () => {
    expect(queueSide({ status: "open", lastReplyRole: "user" })).toBe("you");
  });
  it("is 'them' when staff replied last", () => {
    expect(queueSide({ status: "pending", lastReplyRole: "staff" })).toBe("them");
  });
  it("is 'done' once resolved or closed, whoever spoke last", () => {
    expect(queueSide({ status: "resolved", lastReplyRole: "user" })).toBe("done");
    expect(queueSide({ status: "closed", lastReplyRole: "staff" })).toBe("done");
  });
});

describe("isOpenState", () => {
  it("open and pending are open; resolved and closed are not", () => {
    expect(isOpenState("open")).toBe(true);
    expect(isOpenState("pending")).toBe(true);
    expect(isOpenState("resolved")).toBe(false);
    expect(isOpenState("closed")).toBe(false);
  });
});

describe("preview", () => {
  it("collapses whitespace and truncates", () => {
    expect(preview("line one\n\n  line two")).toBe("line one line two");
    expect(preview("x".repeat(200), 20)).toHaveLength(20);
    expect(preview("x".repeat(200), 20).endsWith("…")).toBe(true);
  });
});
