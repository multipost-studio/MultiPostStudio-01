import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * runDueJobs runs jobs concurrently across workspaces but strictly in order
 * within one, and still claims every job atomically. The database is faked
 * just enough to observe that: no real provider is called (jobs have no
 * connected account, so they take the simulated, non-production path).
 */

type Job = { id: string; postId: string; attempts: number; lastError: string | null; status: string };

const state = vi.hoisted(() => ({
  jobs: [] as Job[],
  workspaceOfPost: {} as Record<string, string>,
  claimLost: new Set<string>(),
  crashOn: new Set<string>(),
  log: [] as string[],
  inFlight: 0,
  maxInFlight: 0,
  inFlightByWs: {} as Record<string, number>,
  maxByWs: {} as Record<string, number>,
}));

vi.mock("@/lib/env", () => ({ isProduction: false }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn(), notifyWorkspace: vi.fn() }));
vi.mock("@/lib/adapters/webhooks", () => ({ dispatchWebhook: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ debumpUsage: vi.fn() }));
vi.mock("@/lib/streak-service", () => ({ notifyStreakMilestone: vi.fn() }));
vi.mock("@/lib/social/oauth", () => ({ isDeadTokenError: vi.fn(() => false), markAccountExpired: vi.fn() }));
vi.mock("@/lib/adapters/publish", () => ({
  canPublishReal: vi.fn(() => false),
  isRetryablePublishError: vi.fn(() => false),
  publishToPlatform: vi.fn(),
  postFirstComment: vi.fn(),
  logPublishFailure: vi.fn(),
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

vi.mock("@/lib/db", () => ({
  db: {
    publishJob: {
      updateMany: vi.fn(async ({ where }: { where: { id?: string } }) => {
        if (!where.id) return { count: 0 }; // reapStaleJobs
        if (state.claimLost.has(where.id)) return { count: 0 };
        return { count: 1 };
      }),
      findMany: vi.fn(async () => state.jobs),
      findUnique: vi.fn(async () => ({ status: "running" })),
      update: vi.fn(async () => ({})),
    },
    post: {
      findMany: vi.fn(async () => Object.entries(state.workspaceOfPost).map(([id, workspaceId]) => ({ id, workspaceId }))),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const job = state.jobs.find((j) => j.postId === where.id)!;
        const ws = state.workspaceOfPost[where.id];
        state.log.push(`start:${job.id}`);
        state.inFlight++;
        state.inFlightByWs[ws] = (state.inFlightByWs[ws] ?? 0) + 1;
        state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
        state.maxByWs[ws] = Math.max(state.maxByWs[ws] ?? 0, state.inFlightByWs[ws]);
        await sleep(15);
        state.inFlight--;
        state.inFlightByWs[ws]--;
        if (state.crashOn.has(job.id)) throw new Error(`boom ${job.id}`);
        return {
          id: where.id,
          title: "t",
          workspaceId: ws,
          authorId: "a",
          firstComment: null,
          channels: [],
          media: [],
          workspace: { orgId: "o", slug: "s" },
        };
      }),
      update: vi.fn(async () => ({})),
    },
    postChannel: { update: vi.fn() },
    postPrediction: { findUnique: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ timezone: "UTC" })) },
  },
}));

import { runDueJobs } from "./queue";

const job = (id: string, postId: string): Job => ({ id, postId, attempts: 0, lastError: null, status: "queued" });

beforeEach(() => {
  state.jobs = [];
  state.workspaceOfPost = {};
  state.claimLost = new Set();
  state.crashOn = new Set();
  state.log = [];
  state.inFlight = 0;
  state.maxInFlight = 0;
  state.inFlightByWs = {};
  state.maxByWs = {};
});

function seed(layout: Record<string, string[]>) {
  // layout: workspace -> job ids (in due order). Interleave so order matters.
  const all: Job[] = [];
  const max = Math.max(...Object.values(layout).map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const [ws, ids] of Object.entries(layout)) {
      if (!ids[i]) continue;
      const postId = `post-${ids[i]}`;
      state.workspaceOfPost[postId] = ws;
      all.push(job(ids[i], postId));
    }
  }
  state.jobs = all;
}

describe("runDueJobs concurrency", () => {
  it("runs different workspaces in parallel, bounded", async () => {
    seed({ w1: ["a1"], w2: ["b1"], w3: ["c1"], w4: ["d1"], w5: ["e1"], w6: ["f1"] });
    const r = await runDueJobs();
    expect(r.processed).toBe(6);
    expect(state.maxInFlight).toBeGreaterThan(1);
    expect(state.maxInFlight).toBeLessThanOrEqual(4);
  });

  it("keeps one workspace strictly sequential and in due order", async () => {
    seed({ w1: ["a1", "a2", "a3"], w2: ["b1", "b2"] });
    const r = await runDueJobs();
    expect(r.processed).toBe(5);
    expect(state.maxByWs.w1).toBe(1);
    expect(state.maxByWs.w2).toBe(1);
    const order = (prefix: string) => state.log.filter((l) => l.startsWith(`start:${prefix}`));
    expect(order("a")).toEqual(["start:a1", "start:a2", "start:a3"]);
    expect(order("b")).toEqual(["start:b1", "start:b2"]);
  });

  it("skips a job another runner already claimed, and does not count it", async () => {
    seed({ w1: ["a1", "a2"] });
    state.claimLost.add("a1");
    const r = await runDueJobs();
    expect(r.processed).toBe(1);
    expect(state.log).toEqual(["start:a2"]);
  });

  it("one crashing job does not starve the rest, and the tick still reports the failure", async () => {
    seed({ w1: ["a1", "a2"], w2: ["b1"] });
    state.crashOn.add("a1");
    await expect(runDueJobs()).rejects.toThrow("boom a1");
    expect(state.log).toContain("start:b1");
    expect(state.log).toContain("start:a2"); // same lane continues after a crash
  });

  it("handles an empty queue", async () => {
    expect(await runDueJobs()).toEqual({ processed: 0 });
  });
});
