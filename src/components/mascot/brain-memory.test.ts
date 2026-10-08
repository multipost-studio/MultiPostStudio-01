import { describe, it, expect } from "vitest";
import type { Insight } from "@/lib/mascot-brain/types";
import { EMPTY_MEMORY, SNOOZE_MS, isSnoozed, mergeMemory, pickProactive, proactiveBudgetLeft, rememberQuestion, snooze, visibleInsights } from "./brain-memory";

const NOW = 1_800_000_000_000;
const ins = (id: string, severity: Insight["severity"]): Insight => ({ id, severity, title: id, body: "", score: 50, topic: "t" });

describe("memory parsing", () => {
  it("survives garbage and drops expired or oversized entries", () => {
    expect(mergeMemory(null, NOW)).toEqual(EMPTY_MEMORY);
    expect(mergeMemory("x", NOW)).toEqual(EMPTY_MEMORY);
    expect(mergeMemory([1, 2], NOW)).toEqual(EMPTY_MEMORY);
    const m = mergeMemory({ snoozed: { keep: NOW + 1000, old: NOW - 1, bad: "soon", ["x".repeat(81)]: NOW + 5 }, recentQuestions: ["a", 3, "", "b"] }, NOW);
    expect(Object.keys(m.snoozed)).toEqual(["keep"]);
    expect(m.recentQuestions).toEqual(["a", "b"]);
  });
});

describe("snoozing", () => {
  it("quiets an insight for its severity's duration, then it returns", () => {
    const i = ins("failed:2", "critical");
    const m = snooze(EMPTY_MEMORY, i, NOW);
    expect(isSnoozed(m, "failed:2", NOW + SNOOZE_MS.critical - 1)).toBe(true);
    expect(isSnoozed(m, "failed:2", NOW + SNOOZE_MS.critical + 1)).toBe(false);
  });

  it("problems come back sooner than tips", () => {
    expect(SNOOZE_MS.critical).toBeLessThan(SNOOZE_MS.warn);
    expect(SNOOZE_MS.warn).toBeLessThan(SNOOZE_MS.info);
    expect(SNOOZE_MS.info).toBeLessThan(SNOOZE_MS.win);
  });

  it("a worse situation has a new id, so an old dismissal does not hide it", () => {
    const m = snooze(EMPTY_MEMORY, ins("failed:2", "critical"), NOW);
    expect(isSnoozed(m, "failed:5", NOW)).toBe(false);
  });

  it("does not mutate the previous memory", () => {
    const before = { snoozed: {}, recentQuestions: ["q"] };
    snooze(before, ins("a", "warn"), NOW);
    rememberQuestion(before, "other");
    expect(before).toEqual({ snoozed: {}, recentQuestions: ["q"] });
  });
});

describe("recent questions", () => {
  it("keeps the latest five, newest first, without duplicates", () => {
    let m = EMPTY_MEMORY;
    for (const q of ["a", "b", "c", "d", "e", "f"]) m = rememberQuestion(m, q);
    expect(m.recentQuestions).toEqual(["f", "e", "d", "c", "b"]);
    m = rememberQuestion(m, "D");
    expect(m.recentQuestions[0]).toBe("D");
    expect(m.recentQuestions.filter((q) => q.toLowerCase() === "d")).toHaveLength(1);
    expect(rememberQuestion(m, "   ")).toBe(m);
  });
});

describe("choosing what to say unprompted", () => {
  const list = [ins("tip", "info"), ins("approve", "warn"), ins("fail", "critical"), ins("win", "win")];

  it("only speaks up for problems, never for tips or wins", () => {
    expect(pickProactive([ins("tip", "info"), ins("win", "win")], EMPTY_MEMORY, new Set(), NOW)).toBeNull();
  });

  it("takes the first problem in ranked order", () => {
    expect(pickProactive([ins("fail", "critical"), ins("approve", "warn")], EMPTY_MEMORY, new Set(), NOW)?.id).toBe("fail");
  });

  it("skips snoozed and already-mentioned problems", () => {
    const m = snooze(EMPTY_MEMORY, ins("fail", "critical"), NOW);
    expect(pickProactive(list, m, new Set(), NOW)?.id).toBe("approve");
    expect(pickProactive(list, m, new Set(["approve"]), NOW)).toBeNull();
  });

  it("hides snoozed items from the visible list", () => {
    const m = snooze(EMPTY_MEMORY, ins("approve", "warn"), NOW);
    expect(visibleInsights(list, m, NOW).map((i) => i.id)).toEqual(["tip", "fail", "win"]);
  });
});

describe("not being annoying", () => {
  it("stops after three messages or two ignored ones in a session", () => {
    expect(proactiveBudgetLeft({ shown: 0, ignored: 0 })).toBe(true);
    expect(proactiveBudgetLeft({ shown: 2, ignored: 1 })).toBe(true);
    expect(proactiveBudgetLeft({ shown: 3, ignored: 0 })).toBe(false);
    expect(proactiveBudgetLeft({ shown: 2, ignored: 2 })).toBe(false);
  });
});

describe("page awareness", () => {
  const withAction = (id: string, severity: Insight["severity"], topic: string, href: string): Insight => ({ ...ins(id, severity), topic, action: { label: "Go", href } });

  it("never points at the page you are already on", () => {
    const list = [withAction("fail", "critical", "publishing", "/queue"), withAction("acct", "warn", "accounts", "/integrations")];
    expect(pickProactive(list, EMPTY_MEMORY, new Set(), NOW, "/queue")?.id).toBe("acct");
    expect(pickProactive(list, EMPTY_MEMORY, new Set(), NOW, "/queue/job-1")?.id).toBe("acct");
    expect(pickProactive([list[0]], EMPTY_MEMORY, new Set(), NOW, "/queue")).toBeNull();
  });

  it("prefers what belongs to the current page among equal severities", () => {
    const list = [withAction("approve", "warn", "approvals", "/approvals"), withAction("acct", "warn", "accounts", "/integrations")];
    expect(pickProactive(list, EMPTY_MEMORY, new Set(), NOW, "/dashboard")?.id).toBe("approve");
    expect(pickProactive(list, EMPTY_MEMORY, new Set(), NOW, "/inbox")?.id).toBe("approve");
    const onIntegrations = pickProactive([list[1], list[0]], EMPTY_MEMORY, new Set(), NOW, "/calendar");
    expect(onIntegrations?.id).toBe("acct");
  });

  it("never lets relevance outrank severity", () => {
    const list = [withAction("fail", "critical", "publishing", "/queue"), withAction("approve", "warn", "approvals", "/approvals")];
    expect(pickProactive(list, EMPTY_MEMORY, new Set(), NOW, "/approvals")?.id).toBe("fail");
    expect(pickProactive(list, EMPTY_MEMORY, new Set(), NOW, "/inbox")?.id).toBe("fail");
  });
});
