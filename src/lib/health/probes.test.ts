import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findSetting: vi.fn(),
  upsertSetting: vi.fn(),
  jobCount: vi.fn(),
  jobFirst: vi.fn(),
  postCount: vi.fn(),
  postFirst: vi.fn(),
  groupBy: vi.fn(),
  socialCount: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    systemSetting: { findUnique: m.findSetting, upsert: m.upsertSetting },
    publishJob: { count: m.jobCount, findFirst: m.jobFirst },
    post: { count: m.postCount, findFirst: m.postFirst },
    socialAccount: { groupBy: m.groupBy, count: m.socialCount },
    $queryRaw: m.queryRaw,
  },
}));
vi.mock("@/lib/env", () => ({
  env: { DATABASE_URL: "postgres://user:hunter2secret@db.example/app", AUTH_SECRET: "x".repeat(32), NODE_ENV: "test" },
  flags: {},
  isProduction: false,
}));
vi.mock("@/lib/social/crypto", () => ({ encryptToken: vi.fn(), decryptToken: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { DEFAULT_HEALTH_CONFIG, type HealthConfig } from "./config";
import { databaseProbe, overdueProbe, publishingProbe, socialProbe, workerProbe } from "./probes-core";
import { runProbe } from "./run";
import type { ProbeDef } from "./probe-kit";

const NOW = new Date("2026-10-06T12:00:00Z");
const config = (patch: Partial<HealthConfig["thresholds"]> = {}): HealthConfig => ({
  ...DEFAULT_HEALTH_CONFIG,
  thresholds: { ...DEFAULT_HEALTH_CONFIG.thresholds, ...patch },
});
const ctx = (c = config()) => ({ config: c, now: NOW });
const stamp = (ageSec: number) => ({ value: JSON.stringify(new Date(NOW.getTime() - ageSec * 1000).toISOString()) });

beforeEach(() => {
  vi.clearAllMocks();
  m.upsertSetting.mockResolvedValue({});
  m.queryRaw.mockResolvedValue([{ v: "PostgreSQL 16.2 on x", size: BigInt(5_242_880), conns: BigInt(4) }]);
});

describe("worker probe", () => {
  const setup = (o: { tickAge: number | null; queued?: number; running?: number; due?: number; lagSec?: number; stuck?: number; failed?: number }) => {
    m.findSetting.mockResolvedValue(o.tickAge === null ? null : stamp(o.tickAge));
    m.jobCount
      .mockResolvedValueOnce(o.queued ?? 0)
      .mockResolvedValueOnce(o.running ?? 0)
      .mockResolvedValueOnce(o.due ?? 0)
      .mockResolvedValueOnce(o.stuck ?? 0)
      .mockResolvedValueOnce(o.failed ?? 0);
    m.jobFirst.mockResolvedValue(o.lagSec ? { runAt: new Date(NOW.getTime() - o.lagSec * 1000) } : null);
  };

  it("is healthy with a fresh heartbeat", async () => {
    setup({ tickAge: 30, queued: 2, running: 1 });
    const r = await workerProbe.run(ctx());
    expect(r.status).toBe("healthy");
    expect(r.details).toMatchObject({ tickAgeSec: 30, queued: 2, running: 1 });
  });

  it("goes degraded when the heartbeat is older than the admin's limit", async () => {
    setup({ tickAge: 400 });
    expect((await workerProbe.run(ctx())).status).toBe("degraded");
    setup({ tickAge: 400 });
    expect((await workerProbe.run(ctx(config({ workerStaleSec: 900 })))).status).toBe("healthy");
  });

  it("goes unhealthy when it is stale and due jobs are piling up", async () => {
    setup({ tickAge: 4000, queued: 5, due: 5, lagSec: 3600 });
    const r = await workerProbe.run(ctx());
    expect(r.status).toBe("unhealthy");
    expect(r.message).toContain("5 due");
  });

  it("flags stuck jobs", async () => {
    setup({ tickAge: 10, running: 1, stuck: 2 });
    expect((await workerProbe.run(ctx())).status).toBe("degraded");
    setup({ tickAge: 10, running: 5, stuck: 5 });
    expect((await workerProbe.run(ctx())).status).toBe("unhealthy");
  });

  it("distinguishes never-ran with and without waiting jobs", async () => {
    setup({ tickAge: null, due: 0 });
    expect((await workerProbe.run(ctx())).status).toBe("degraded");
    setup({ tickAge: null, queued: 3, due: 3 });
    expect((await workerProbe.run(ctx())).status).toBe("unhealthy");
  });
});

describe("publishing probe", () => {
  const counts = (published: number, failed: number) => m.postCount.mockResolvedValueOnce(published).mockResolvedValueOnce(failed);

  it("is healthy when nothing was published", async () => {
    counts(0, 0);
    expect((await publishingProbe.run(ctx())).status).toBe("healthy");
  });

  it("applies the failure-rate threshold", async () => {
    counts(9, 1);
    expect((await publishingProbe.run(ctx())).status).toBe("healthy"); // 10% < 20%
    counts(7, 3);
    expect((await publishingProbe.run(ctx())).status).toBe("degraded"); // 30%
    counts(7, 3);
    expect((await publishingProbe.run(ctx(config({ failureRatePct: 50 })))).status).toBe("healthy");
  });

  it("is unhealthy when most publishes fail", async () => {
    counts(2, 10);
    expect((await publishingProbe.run(ctx())).status).toBe("unhealthy");
  });
});

describe("overdue probe", () => {
  it("passes when nothing is late and reports the oldest otherwise", async () => {
    m.postCount.mockResolvedValueOnce(0);
    m.postFirst.mockResolvedValueOnce(null);
    expect((await overdueProbe.run(ctx())).status).toBe("healthy");

    m.postCount.mockResolvedValueOnce(3);
    m.postFirst.mockResolvedValueOnce({ scheduledAt: new Date(NOW.getTime() - 45 * 60_000) });
    const r = await overdueProbe.run(ctx());
    expect(r.status).toBe("degraded");
    expect(r.details).toMatchObject({ overdue: 3, oldestLateMin: 45 });

    m.postCount.mockResolvedValueOnce(12);
    m.postFirst.mockResolvedValueOnce({ scheduledAt: new Date(NOW.getTime() - 5 * 60_000) });
    expect((await overdueProbe.run(ctx())).status).toBe("unhealthy");
  });
});

describe("social probe", () => {
  const groups = (g: Record<string, number>) => m.groupBy.mockResolvedValue(Object.entries(g).map(([status, n]) => ({ status, _count: { _all: n } })));

  it("is skipped when nothing is connected", async () => {
    groups({});
    m.socialCount.mockResolvedValue(0);
    expect((await socialProbe.run(ctx())).status).toBe("skipped");
  });

  it("degrades for a broken account or an expiring token, and fails when most are broken", async () => {
    groups({ connected: 3, error: 1 });
    m.socialCount.mockResolvedValue(0);
    expect((await socialProbe.run(ctx())).status).toBe("degraded");
    groups({ connected: 4 });
    m.socialCount.mockResolvedValue(2);
    expect((await socialProbe.run(ctx())).status).toBe("degraded");
    groups({ connected: 1, expired: 2, disconnected: 1 });
    m.socialCount.mockResolvedValue(0);
    expect((await socialProbe.run(ctx())).status).toBe("unhealthy");
    groups({ connected: 5 });
    m.socialCount.mockResolvedValue(0);
    expect((await socialProbe.run(ctx())).status).toBe("healthy");
  });
});

describe("database probe", () => {
  it("rates latency against the configured thresholds and reports a write failure", async () => {
    m.queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]).mockResolvedValueOnce([{ v: "PostgreSQL 16.2 on x", size: BigInt(1_048_576), conns: BigInt(2) }]);
    const ok = await databaseProbe.run(ctx());
    expect(ok.status).toBe("healthy");
    expect(ok.details).toMatchObject({ writeOk: true, version: "PostgreSQL 16.2", openConnections: 2 });

    m.queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]).mockResolvedValueOnce([]);
    m.upsertSetting.mockRejectedValueOnce(new Error("cannot execute UPSERT in a read-only transaction"));
    const ro = await databaseProbe.run(ctx());
    expect(ro.status).toBe("degraded");
    expect(ro.message).toContain("write failed");
  });

  it("is degraded or unhealthy once latency passes the thresholds", async () => {
    m.queryRaw.mockImplementationOnce(() => new Promise((r) => setTimeout(() => r([{}]), 70)));
    expect((await databaseProbe.run(ctx(config({ dbDegradedMs: 50, dbUnhealthyMs: 5_000 })))).status).toBe("degraded");
    m.queryRaw.mockImplementationOnce(() => new Promise((r) => setTimeout(() => r([{}]), 70)));
    expect((await databaseProbe.run(ctx(config({ dbDegradedMs: 50, dbUnhealthyMs: 60 })))).status).toBe("unhealthy");
  });
});

describe("runProbe", () => {
  const def = (run: ProbeDef["run"], timeoutMs = 1000): ProbeDef => ({
    id: "database",
    name: "Test",
    category: "core",
    description: "d",
    timeoutMs: () => timeoutMs,
    run,
  });

  it("turns a throw into an unhealthy result and scrubs configured secrets", async () => {
    const r = await runProbe(def(async () => { throw new Error("connect failed for postgres://user:hunter2secret@db.example/app"); }), config(), NOW);
    expect(r.status).toBe("unhealthy");
    expect(r.message).not.toContain("hunter2secret");
    expect(r.message).toContain("[redacted]");
  });

  it("cuts off a hung probe at its timeout", async () => {
    const r = await runProbe(def(() => new Promise(() => {}), 30), config(), NOW);
    expect(r.status).toBe("unhealthy");
    expect(r.message).toContain("30ms");
  });

  it("marks muted probes and still reports their real status", async () => {
    const muted = { ...config(), muted: ["database" as const] };
    const r = await runProbe(def(async () => ({ status: "degraded", message: "slow" })), muted, NOW);
    expect(r).toMatchObject({ status: "degraded", muted: true, message: "slow" });
    const live = await runProbe(def(async () => ({ status: "healthy", message: "ok" })), config(), NOW);
    expect(live.muted).toBeUndefined();
  });
});
