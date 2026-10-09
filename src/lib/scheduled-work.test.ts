import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  jobs: vi.fn(),
  autos: vi.fn(),
  social: vi.fn(),
  rollup: vi.fn(),
  recycle: vi.fn(),
  reports: vi.fn(),
  sla: vi.fn(),
  janitor: vi.fn(),
  blog: vi.fn(),
  billing: vi.fn(),
  notif: vi.fn(),
  health: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: { systemSetting: { upsert: vi.fn().mockResolvedValue({}) } } }));
vi.mock("@/lib/adapters/queue", () => ({ runDueJobs: () => m.jobs() }));
vi.mock("@/lib/adapters/automations", () => ({ runDueAutomations: () => m.autos() }));
vi.mock("@/lib/adapters/metrics-sync", () => ({ runMetricsRollup: () => m.rollup() }));
vi.mock("@/lib/adapters/social-sync", () => ({ runSocialSync: () => m.social() }));
vi.mock("@/lib/adapters/recycling", () => ({ runDueRecycling: () => m.recycle() }));
vi.mock("@/lib/reports-delivery", () => ({ runDueReports: () => m.reports() }));
vi.mock("@/lib/adapters/approval-escalation", () => ({ runApprovalEscalations: () => m.sla() }));
vi.mock("@/lib/janitor", () => ({ runJanitor: () => m.janitor() }));
vi.mock("@/lib/blog-publishing", () => ({ publishDueBlogPosts: () => m.blog() }));
vi.mock("@/lib/billing-reconcile", () => ({ reconcileSubscriptions: () => m.billing() }));
vi.mock("@/lib/notifications/reminders", () => ({ runNotificationJobs: () => m.notif() }));
vi.mock("@/lib/health/history", () => ({ recordScheduledHealthRun: () => m.health() }));

import { runScheduledWork, TICK_BUDGET_MS } from "./scheduled-work";

beforeEach(() => {
  vi.clearAllMocks();
  m.jobs.mockResolvedValue({ processed: 3 });
  m.autos.mockResolvedValue({ ran: 1 });
  m.social.mockResolvedValue({ metrics: 2, inbox: 4 });
  m.rollup.mockResolvedValue({ workspaces: 5 });
  m.recycle.mockResolvedValue({ scheduled: 1 });
  m.reports.mockResolvedValue({ reports: 1, emails: 2 });
  m.sla.mockResolvedValue({ escalated: 0, autoApproved: 0, autoRejected: 0 });
  m.janitor.mockResolvedValue({ verificationTokens: 0, stalePresence: 0, terminalJobs: 0, orphanUploads: 0, oldVisits: 0, oldNotifications: 0 });
  m.blog.mockResolvedValue({ published: 1, postIds: ["b"] });
  m.billing.mockResolvedValue({ checked: 1, corrected: 0, failed: 0 });
  m.notif.mockResolvedValue({ reminders: 2, missed: 0, hourly: null });
  m.health.mockResolvedValue(true);
});

describe("runScheduledWork", () => {
  it("runs every phase and reports their results when there is time", async () => {
    const r = await runScheduledWork();
    expect(r).toMatchObject({ processed: 3, automations: 1, rollup: 5, recycled: 1, blog: { published: 1 } });
    expect(r.skipped).toBeUndefined();
    expect(m.health).toHaveBeenCalledOnce();
  });

  it("publishes first", async () => {
    const order: string[] = [];
    m.jobs.mockImplementation(async () => (order.push("publish"), { processed: 0 }));
    m.social.mockImplementation(async () => (order.push("social"), { metrics: 0, inbox: 0 }));
    await runScheduledWork();
    expect(order).toEqual(["publish", "social"]);
  });

  it("stops starting housekeeping once the budget is spent, but still publishes and runs automations and reminders", async () => {
    let t = 0;
    // the clock jumps past the budget as soon as publishing has run
    m.jobs.mockImplementation(async () => ((t += TICK_BUDGET_MS + 1), { processed: 7 }));
    const r = await runScheduledWork(() => t);
    expect(r.processed).toBe(7);
    expect(m.autos).toHaveBeenCalledOnce();
    expect(m.notif).toHaveBeenCalledOnce();
    for (const skippedFn of [m.social, m.rollup, m.recycle, m.reports, m.sla, m.janitor, m.blog, m.billing, m.health]) expect(skippedFn).not.toHaveBeenCalled();
    expect(r.skipped).toEqual(expect.arrayContaining(["social sync", "metrics rollup", "report delivery", "janitor", "billing reconciliation"]));
  });

  it("a failing phase never stops the others, publishing included", async () => {
    m.jobs.mockRejectedValue(new Error("queue down"));
    m.social.mockRejectedValue(new Error("api down"));
    const r = await runScheduledWork();
    expect(r.processed).toBe(0);
    expect(r.social).toEqual({ metrics: 0, inbox: 0 });
    expect(m.autos).toHaveBeenCalledOnce();
    expect(m.rollup).toHaveBeenCalledOnce();
    expect(m.janitor).toHaveBeenCalledOnce();
  });

  it("a failing notification job leaves the rest of the result intact", async () => {
    m.notif.mockRejectedValue(new Error("boom"));
    const r = await runScheduledWork();
    expect(r.notifications).toBeUndefined();
    expect(r.processed).toBe(3);
  });
});
