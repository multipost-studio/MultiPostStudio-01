import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/settings", () => ({ writeSettings: vi.fn() }));
vi.mock("@/lib/plans", () => ({ invalidatePlans: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ invalidateFeatureFlags: vi.fn() }));
vi.mock("@/lib/cms", () => ({ invalidateCms: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ invalidateOrgPlan: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ applyPlan: vi.fn() }));
vi.mock("@/lib/session", () => {
  const guard = vi.fn(async () => ({ id: "admin1" }));
  return { requirePlatformAdmin: guard, requireAdminPermission: guard };
});
vi.mock("@/lib/db", () => ({
  db: {
    publishJob: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    post: { updateMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { requireAdminPermission } from "@/lib/session";
import { reschedulePublishJobAction, retryPublishJobAction } from "./admin";
import { JOB_MAX_ATTEMPTS, JOB_OVERDUE_MS, jobHealthWhere, jobsQueryOpts, jobsWhere } from "@/lib/admin-exports/activity";
import { parseAdminQuery } from "@/lib/admin-query";

const soon = () => new Date(Date.now() + 3_600_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: "admin1" } as never);
  vi.mocked(db.publishJob.findFirst).mockResolvedValue(null as never);
  vi.mocked(db.publishJob.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe("retryPublishJobAction", () => {
  it("needs the queue.manage permission", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(retryPublishJobAction("j1")).rejects.toThrow("NEXT_REDIRECT");
    expect(db.publishJob.updateMany).not.toHaveBeenCalled();
  });

  it("re-queues a failed job, clears the lease and records where it came from", async () => {
    vi.mocked(db.publishJob.findUnique).mockResolvedValue({ status: "failed", attempts: 5, postId: "p1" } as never);
    expect(await retryPublishJobAction("j1")).toMatchObject({ ok: true });
    const call = vi.mocked(db.publishJob.updateMany).mock.calls[0][0];
    expect(call.where).toEqual({ id: "j1", status: { in: ["failed", "canceled"] } });
    expect(call.data).toMatchObject({ status: "queued", leaseUntil: null, lastError: null });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.job_retried", metadata: { from: "failed", attempts: 5 } }));
  });

  it("refuses a running or finished job: re-queuing it would publish the post twice", async () => {
    for (const status of ["running", "done", "queued"]) {
      vi.mocked(db.publishJob.findUnique).mockResolvedValue({ status, attempts: 1, postId: "p1" } as never);
      expect(await retryPublishJobAction("j1")).toMatchObject({ ok: false });
    }
    expect(db.publishJob.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an unknown job, a bad id, and a post that already has an active job", async () => {
    vi.mocked(db.publishJob.findUnique).mockResolvedValue(null as never);
    expect(await retryPublishJobAction("nope")).toMatchObject({ ok: false });
    expect(await retryPublishJobAction("")).toMatchObject({ ok: false });
    vi.mocked(db.publishJob.findUnique).mockResolvedValue({ status: "failed", attempts: 1, postId: "p1" } as never);
    vi.mocked(db.publishJob.findFirst).mockResolvedValue({ id: "j2" } as never);
    expect(await retryPublishJobAction("j1")).toMatchObject({ ok: false });
    expect(db.publishJob.updateMany).not.toHaveBeenCalled();
  });

  it("does not claim success when the job changed state underneath it", async () => {
    vi.mocked(db.publishJob.findUnique).mockResolvedValue({ status: "failed", attempts: 1, postId: "p1" } as never);
    vi.mocked(db.publishJob.updateMany).mockResolvedValue({ count: 0 } as never);
    expect(await retryPublishJobAction("j1")).toMatchObject({ ok: false });
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("reschedulePublishJobAction", () => {
  const queued = { status: "queued", runAt: new Date("2026-10-10T10:00:00Z"), postId: "p1" };

  it("moves a queued job and its scheduled post, and audits from and to", async () => {
    vi.mocked(db.publishJob.findUnique).mockResolvedValue(queued as never);
    const to = soon();
    expect(await reschedulePublishJobAction("j1", to)).toMatchObject({ ok: true });
    expect(db.publishJob.updateMany).toHaveBeenCalledWith({ where: { id: "j1", status: "queued" }, data: { runAt: new Date(to) } });
    expect(db.post.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "scheduled" }, data: { scheduledAt: new Date(to) } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.job_rescheduled", metadata: { from: "2026-10-10T10:00:00.000Z", to: new Date(to).toISOString() } }));
  });

  it("only moves queued jobs", async () => {
    for (const status of ["running", "done", "failed", "canceled"]) {
      vi.mocked(db.publishJob.findUnique).mockResolvedValue({ ...queued, status } as never);
      expect(await reschedulePublishJobAction("j1", soon())).toMatchObject({ ok: false });
    }
    expect(db.publishJob.updateMany).not.toHaveBeenCalled();
  });

  it("rejects bad, past and far-future times", async () => {
    vi.mocked(db.publishJob.findUnique).mockResolvedValue(queued as never);
    expect(await reschedulePublishJobAction("j1", "not a date")).toMatchObject({ ok: false });
    expect(await reschedulePublishJobAction("j1", new Date(Date.now() - 3_600_000).toISOString())).toMatchObject({ ok: false });
    expect(await reschedulePublishJobAction("j1", new Date(Date.now() + 400 * 86_400_000).toISOString())).toMatchObject({ ok: false });
    expect(await reschedulePublishJobAction("", soon())).toMatchObject({ ok: false });
    expect(db.publishJob.updateMany).not.toHaveBeenCalled();
  });

  it("does not touch the post when the job started in the meantime", async () => {
    vi.mocked(db.publishJob.findUnique).mockResolvedValue(queued as never);
    vi.mocked(db.publishJob.updateMany).mockResolvedValue({ count: 0 } as never);
    expect(await reschedulePublishJobAction("j1", soon())).toMatchObject({ ok: false });
    expect(db.post.updateMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("job health filters", () => {
  const NOW = new Date("2026-10-09T12:00:00Z");

  it("describes each kind of job that needs attention", () => {
    expect(jobHealthWhere("overdue", NOW)).toEqual({ status: "queued", runAt: { lt: new Date(NOW.getTime() - JOB_OVERDUE_MS) } });
    expect(jobHealthWhere("stuck", NOW)).toEqual({ status: "running", leaseUntil: { lt: NOW } });
    expect(jobHealthWhere("exhausted", NOW)).toEqual({ status: "failed", attempts: { gte: JOB_MAX_ATTEMPTS } });
    expect(jobHealthWhere("whatever", NOW)).toBeNull();
  });

  it("applies the filter in the list query and combines it with a date range", () => {
    const q = (f: Record<string, string>) => parseAdminQuery(f, jobsQueryOpts);
    expect(jobsWhere(q({ health: "stuck" }), NOW)).toMatchObject({ status: "running" });
    const both = jobsWhere(q({ health: "overdue", from: "2026-10-01" }), NOW);
    expect(both.runAt).toMatchObject({ lt: expect.any(Date), gte: new Date("2026-10-01T00:00:00Z") });
    expect(jobsWhere(q({ health: "bogus" }), NOW)).toEqual({});
  });
});
