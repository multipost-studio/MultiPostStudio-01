import { describe, expect, it } from "vitest";
import { BACKUP_STALE_DAYS, RESTORE_TEST_STALE_DAYS, freshness, isCheckKind, isCheckResult } from "./recovery-status";

const NOW = new Date("2026-10-09T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const row = (kind: string, result: string, days: number) => ({ kind, result, occurredAt: ago(days) });

describe("freshness", () => {
  it("is never with no evidence, and ignores the other kind", () => {
    expect(freshness([], "backup", NOW).state).toBe("never");
    expect(freshness([row("restore_test", "ok", 1)], "backup", NOW).state).toBe("never");
  });

  it("is fresh inside the window and stale after it, per kind", () => {
    expect(freshness([row("backup", "ok", 2)], "backup", NOW)).toMatchObject({ state: "fresh", ageDays: 2 });
    expect(freshness([row("backup", "ok", BACKUP_STALE_DAYS + 1)], "backup", NOW).state).toBe("stale");
    expect(freshness([row("restore_test", "ok", 60)], "restore_test", NOW).state).toBe("fresh");
    expect(freshness([row("restore_test", "ok", RESTORE_TEST_STALE_DAYS + 1)], "restore_test", NOW).state).toBe("stale");
  });

  it("uses the newest successful check, not the first in the list", () => {
    const rows = [row("backup", "ok", 30), row("backup", "ok", 1), row("backup", "ok", 15)];
    expect(freshness(rows, "backup", NOW)).toMatchObject({ state: "fresh", ageDays: 1 });
  });

  it("a failed attempt after the last success means failing, and reports when it last worked", () => {
    const f = freshness([row("backup", "ok", 5), row("backup", "failed", 1)], "backup", NOW);
    expect(f.state).toBe("failing");
    expect(f.ageDays).toBe(5);
    expect(f.lastOkAt).toEqual(ago(5));
  });

  it("a success after a failure recovers it", () => {
    expect(freshness([row("backup", "failed", 3), row("backup", "ok", 1)], "backup", NOW).state).toBe("fresh");
  });

  it("only failures so far is failing, not fresh", () => {
    expect(freshness([row("restore_test", "failed", 2)], "restore_test", NOW)).toMatchObject({ state: "failing", lastOkAt: null, ageDays: null });
  });
});

describe("guards", () => {
  it("know the kinds and results", () => {
    expect(isCheckKind("backup")).toBe(true);
    expect(isCheckKind("snapshot")).toBe(false);
    expect(isCheckResult("ok")).toBe(true);
    expect(isCheckResult("maybe")).toBe(false);
  });
});
