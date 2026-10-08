import { describe, it, expect } from "vitest";
import { attentionCount, buildInsights, topInsight } from "./insights";
import { calmFacts } from "./fixtures";

const ids = (f: ReturnType<typeof calmFacts>) => buildInsights(f).map((i) => i.id);

describe("a calm workspace", () => {
  it("has nothing to shout about", () => {
    const list = buildInsights(calmFacts());
    expect(list.filter((i) => i.severity === "critical" || i.severity === "warn")).toEqual([]);
    expect(topInsight(list)).toBeNull();
    expect(attentionCount(list)).toBe(0);
  });
});

describe("problems", () => {
  it("failed posts are critical, quote the reason, and carry the count in the id", () => {
    const f = calmFacts({ failed: { count7d: 3, recent: [{ id: "p1", title: "Launch", at: null, platforms: ["x"], error: "Token expired for X" }] } });
    const [top] = buildInsights(f);
    expect(top).toMatchObject({ id: "failed:3", severity: "critical", title: "3 posts failed to publish", action: { href: "/queue" } });
    expect(top.body).toContain("Token expired for X");
  });

  it("uses a new id when the situation gets worse, so a dismissal does not hide it", () => {
    const two = buildInsights(calmFacts({ failed: { count7d: 2, recent: [] } }))[0].id;
    const five = buildInsights(calmFacts({ failed: { count7d: 5, recent: [] } }))[0].id;
    expect(two).not.toBe(five);
  });

  it("orders critical before warnings before tips", () => {
    const f = calmFacts({
      failed: { count7d: 1, recent: [] },
      approvals: { pending: 2, oldestDays: 3, recent: [] },
      scheduled: { today: [], tomorrow: [], next24h: 4, nextAt: null, overdue: 0, byDay: calmFacts().scheduled.byDay },
    });
    const sev = buildInsights(f).map((i) => i.severity);
    expect(sev.indexOf("critical")).toBeLessThan(sev.indexOf("warn"));
    expect(sev.indexOf("warn")).toBeLessThan(sev.indexOf("info"));
  });

  it("broken and expiring accounts name the accounts", () => {
    const f = calmFacts({ accounts: { total: 3, connected: 1, broken: [{ name: "Acme", platform: "instagram", status: "expired" }], expiring: [{ name: "Acme X", platform: "x", days: 2 }] } });
    const out = buildInsights(f);
    expect(out.find((i) => i.id.startsWith("broken:"))?.body).toContain("Acme (instagram)");
    const exp = out.find((i) => i.id.startsWith("expiring:"));
    expect(exp?.title).toBe("A connection expires in 2 days");
    expect(exp?.severity).toBe("warn");
  });

  it("flags usage at 90% and over the limit", () => {
    const near = buildInsights(calmFacts({ usage: { ai: { used: 92, limit: 100, pct: 92 }, scheduled: { used: 1, limit: 100, pct: 1 }, channels: { used: 1, limit: 10, pct: 10 } } }));
    expect(near.find((i) => i.id === "usage:ai:near")).toMatchObject({ severity: "warn", title: "92% of your AI credits used" });
    const over = buildInsights(calmFacts({ usage: { ai: { used: 120, limit: 100, pct: 120 }, scheduled: { used: 1, limit: 100, pct: 1 }, channels: { used: 1, limit: 10, pct: 10 } } }));
    expect(over.find((i) => i.id === "usage:ai:over")?.severity).toBe("critical");
  });

  it("ignores unlimited plans (limit 0)", () => {
    const out = ids(calmFacts({ usage: { ai: { used: 999, limit: 0, pct: 0 }, scheduled: { used: 0, limit: 0, pct: 0 }, channels: { used: 0, limit: 0, pct: 0 } } }));
    expect(out.some((i) => i.startsWith("usage:"))).toBe(false);
  });

  it("streak at risk only when nothing is scheduled today", () => {
    expect(ids(calmFacts({ streak: { current: 6, status: "at_risk", todayScheduled: false, nextMilestone: 7, daysToNextMilestone: 1 } }))).toContain("streak:6");
    expect(ids(calmFacts({ streak: { current: 6, status: "at_risk", todayScheduled: true, nextMilestone: 7, daysToNextMilestone: 1 } }))).not.toContain("streak:6");
  });
});

describe("permissions", () => {
  it("never surfaces what the viewer cannot act on", () => {
    const busy = {
      approvals: { pending: 4, oldestDays: 5, recent: [] },
      inbox: { open: 3, negative: 1 },
      failed: { count7d: 2, recent: [] },
      accounts: { total: 3, connected: 1, broken: [{ name: "A", platform: "x", status: "error" }], expiring: [] },
      usage: { ai: { used: 99, limit: 100, pct: 99 }, scheduled: { used: 1, limit: 100, pct: 1 }, channels: { used: 1, limit: 10, pct: 10 } },
    };
    const viewer = ids(calmFacts({ perms: ["analytics.view"], ...busy }));
    for (const prefix of ["approvals:", "inbox:", "failed:", "broken:", "usage:"]) expect(viewer.some((i) => i.startsWith(prefix))).toBe(false);
    const client = ids(calmFacts({ perms: ["content.approve", "analytics.view"], ...busy }));
    expect(client.some((i) => i.startsWith("approvals:"))).toBe(true);
    expect(client.some((i) => i.startsWith("inbox:"))).toBe(false);
  });
});

describe("opportunities and wins", () => {
  it("notices an empty week and stale drafts", () => {
    const byDay = calmFacts().scheduled.byDay.map((d, i) => ({ ...d, count: i < 2 ? 1 : 0 }));
    const out = ids(calmFacts({ scheduled: { today: [], tomorrow: [], next24h: 0, nextAt: null, overdue: 0, byDay }, drafts: { stale: 4 } }));
    expect(out).toContain("gaps:5");
    expect(out).toContain("drafts:4");
  });

  it("only recommends a best time when the data supports it", () => {
    expect(ids(calmFacts())).not.toContain("best:Tuesday at 08:00");
    const out = buildInsights(calmFacts({ bestTime: { insufficient: false, label: "Tuesday at 08:00", engagement: 6.25, posts: 9, note: "" } }));
    const best = out.find((i) => i.id === "best:Tuesday at 08:00");
    expect(best?.body).toBe("It averaged 6.3% engagement across 9 posts.");
  });

  it("celebrates real growth but never above a problem", () => {
    const out = buildInsights(calmFacts({ momentum: { published7d: 10, prev7d: 5 }, failed: { count7d: 1, recent: [] } }));
    const win = out.find((i) => i.severity === "win");
    expect(win?.title).toBe("You published 100% more than last week");
    expect(out.indexOf(win!)).toBeGreaterThan(0);
    expect(ids(calmFacts({ momentum: { published7d: 2, prev7d: 1 } })).some((i) => i.startsWith("momentum:"))).toBe(false);
  });
});

describe("first steps", () => {
  it("walks a new workspace through connect, write, schedule", () => {
    expect(ids(calmFacts({ setup: { connected: false, created: false, scheduled: false, firstRun: true } }))).toContain("setup:connect");
    expect(ids(calmFacts({ setup: { connected: true, created: false, scheduled: false, firstRun: true } }))).toContain("setup:create");
    expect(ids(calmFacts({ setup: { connected: true, created: true, scheduled: false, firstRun: false } }))).toContain("setup:schedule");
  });
});

describe("helpers", () => {
  it("topInsight respects the minimum severity and attentionCount ignores tips", () => {
    const list = buildInsights(calmFacts({ drafts: { stale: 5 }, approvals: { pending: 1, oldestDays: 0, recent: [] } }));
    expect(topInsight(list)?.id).toBe("approvals:1");
    expect(topInsight(list, { minSeverity: "info" })?.severity).toBe("warn");
    expect(attentionCount(list)).toBe(1);
  });
});
