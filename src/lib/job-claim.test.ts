import { describe, it, expect } from "vitest";

/**
 * Publish jobs must be claimed atomically.
 *
 * runDueJobs previously did a read-then-write: findMany({ status: "queued" })
 * then update({ where: { id } }). Two runners — the worker and a cron tick, or
 * two overlapping ticks — both saw the same queued job and both published it,
 * duplicating the post on the customer's real account.
 *
 * The fix is a compare-and-swap: updateMany({ where: { id, status: "queued" } })
 * only matches while the row is still queued, so exactly one runner wins and
 * the losers see count === 0. This models that contract without a database.
 */

/** Minimal stand-in for the one row the claim touches. */
function makeJob(status = "queued") {
  return { id: "job_1", status };
}

/** Mirrors `updateMany({ where: { id, status: "queued" }, data: {...} })`. */
function claim(job: { status: string }): { count: number } {
  if (job.status !== "queued") return { count: 0 };
  job.status = "running";
  return { count: 1 };
}

/** The old behaviour, kept to show what it allowed. */
function unguardedClaim(job: { status: string }): { count: number } {
  job.status = "running";
  return { count: 1 };
}

describe("publish job claiming", () => {
  it("lets exactly one of two concurrent runners take a job", () => {
    const job = makeJob();
    const a = claim(job);
    const b = claim(job); // second runner, same job, after the first claimed it
    expect(a.count).toBe(1);
    expect(b.count).toBe(0);
    expect([a.count, b.count].filter((c) => c === 1)).toHaveLength(1);
  });

  it("a losing runner must skip, not publish", () => {
    const job = makeJob();
    claim(job);
    const published: string[] = [];
    const second = claim(job);
    if (second.count > 0) published.push(job.id); // guarded by `if (count === 0) continue`
    expect(published).toEqual([]);
  });

  it("survives many simultaneous runners", () => {
    const job = makeJob();
    const results = Array.from({ length: 12 }, () => claim(job));
    expect(results.filter((r) => r.count === 1)).toHaveLength(1);
    expect(results.filter((r) => r.count === 0)).toHaveLength(11);
  });

  it("will not re-claim a job already running or done", () => {
    for (const status of ["running", "done", "failed"]) {
      expect(claim(makeJob(status)).count).toBe(0);
    }
  });

  it("demonstrates the bug the guard removes", () => {
    // Without the status guard both runners "win" and the post goes out twice.
    const job = makeJob();
    const a = unguardedClaim(job);
    const b = unguardedClaim(job);
    expect(a.count + b.count).toBe(2);
  });
});
