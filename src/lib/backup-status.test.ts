import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ env: { SUPABASE_ACCESS_TOKEN: "sbp_secret" as string | undefined, SUPABASE_PROJECT_REF: "abcd1234" as string | undefined } }));
vi.mock("@/lib/env", () => ({ env: st.env }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { BACKUP_STALE_DAYS } from "./recovery-status";
import { fetchSupabaseBackups, judgeLatest, parseBackups } from "./backup-status";

const NOW = new Date("2026-10-12T12:00:00Z");

describe("parseBackups", () => {
  it("reads daily backups newest first, and PITR", () => {
    const s = parseBackups({
      region: "ap-southeast-1",
      pitr_enabled: true,
      backups: [
        { is_physical_backup: false, status: "COMPLETED", inserted_at: "2026-10-10T03:00:00Z" },
        { is_physical_backup: false, status: "completed", inserted_at: "2026-10-11T03:00:00Z" },
        { is_physical_backup: true, status: "FAILED", inserted_at: "2026-10-12T03:00:00Z" },
      ],
    })!;
    expect(s.pitr).toBe(true);
    expect(s.region).toBe("ap-southeast-1");
    expect(s.items.map((i) => i.status)).toEqual(["FAILED", "COMPLETED", "COMPLETED"]);
    expect(s.latestCompletedAt?.toISOString()).toBe("2026-10-11T03:00:00.000Z"); // a failed backup is not the latest good one
  });

  it("counts the point-in-time recovery window as recoverable", () => {
    const s = parseBackups({ pitr_enabled: true, backups: [], physical_backup_data: { latest_physical_backup_date_unix: Date.parse("2026-10-12T11:59:00Z") / 1000 } })!;
    expect(s.latestCompletedAt?.toISOString()).toBe("2026-10-12T11:59:00.000Z");
  });

  it("skips malformed entries and tolerates missing optional fields", () => {
    const s = parseBackups({ backups: [null, 5, { inserted_at: "not a date" }, { status: "COMPLETED" }, { inserted_at: "2026-10-01T00:00:00Z" }] })!;
    expect(s.items).toHaveLength(1);
    expect(s.items[0].status).toBe("UNKNOWN");
    expect(s.pitr).toBeNull();
    expect(s.latestCompletedAt).toBeNull(); // unknown status is not evidence of a good backup
  });

  it("returns null for anything that is not the expected shape", () => {
    for (const bad of [null, undefined, "x", 5, [], {}, { backups: "no" }]) expect(parseBackups(bad)).toBeNull();
  });

  it("keeps at most fourteen entries", () => {
    const backups = Array.from({ length: 30 }, (_, i) => ({ status: "COMPLETED", inserted_at: new Date(Date.UTC(2026, 9, 1 + (i % 28))).toISOString() }));
    expect(parseBackups({ backups })!.items).toHaveLength(14);
  });
});

describe("judgeLatest", () => {
  it("is fresh inside the window, stale after it, none without a backup", () => {
    expect(judgeLatest(new Date("2026-10-11T12:00:00Z"), NOW)).toEqual({ state: "fresh", ageDays: 1 });
    expect(judgeLatest(new Date(NOW.getTime() - (BACKUP_STALE_DAYS + 1) * 86_400_000), NOW).state).toBe("stale");
    expect(judgeLatest(null, NOW)).toEqual({ state: "none", ageDays: null });
  });
});

describe("fetchSupabaseBackups", () => {
  beforeEach(() => {
    st.env.SUPABASE_ACCESS_TOKEN = "sbp_secret";
    st.env.SUPABASE_PROJECT_REF = "abcd1234";
    vi.unstubAllGlobals();
  });

  it("is not configured without both the token and the project ref, and never calls out", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    st.env.SUPABASE_ACCESS_TOKEN = undefined;
    expect(await fetchSupabaseBackups(1)).toEqual({ ok: false, reason: "not_configured" });
    st.env.SUPABASE_ACCESS_TOKEN = "t";
    st.env.SUPABASE_PROJECT_REF = undefined;
    expect(await fetchSupabaseBackups(2)).toEqual({ ok: false, reason: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });

  it("calls only api.supabase.com with the bearer token, and parses the answer", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ pitr_enabled: false, backups: [{ status: "COMPLETED", inserted_at: "2026-10-11T03:00:00Z" }] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await fetchSupabaseBackups(100_000);
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.supabase.com/v1/projects/abcd1234/database/backups");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sbp_secret");
  });

  it("caches for a minute", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ backups: [] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await fetchSupabaseBackups(1_000_000);
    await fetchSupabaseBackups(1_030_000);
    expect(f).toHaveBeenCalledTimes(1);
    await fetchSupabaseBackups(1_070_000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("distinguishes a rejected token, an unreachable service and an unreadable answer, without leaking the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    expect(await fetchSupabaseBackups(2_000_000)).toMatchObject({ ok: false, reason: "rejected" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    expect(await fetchSupabaseBackups(3_000_000)).toMatchObject({ ok: false, reason: "unreachable" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ surprise: true }), { status: 200 })));
    expect(await fetchSupabaseBackups(4_000_000)).toMatchObject({ ok: false, reason: "unreadable" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sbp_secret leaked in a message"); }));
    const r = await fetchSupabaseBackups(5_000_000);
    expect(r).toEqual({ ok: false, reason: "unreachable" });
    expect(JSON.stringify(r)).not.toContain("sbp_secret");
  });
});
