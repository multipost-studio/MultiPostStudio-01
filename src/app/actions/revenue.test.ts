import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLatestFxRatesAction, saveFxRatesAction } from "./revenue";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { requirePlatformAdmin } from "@/lib/session";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/session", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { systemSetting: { findUnique: vi.fn(), upsert: vi.fn() } } }));

const ADMIN = { id: "admin_1" };
const NOT_ADMIN = new Error("NEXT_REDIRECT");
const stored = (rates: Record<string, number>) => ({ key: "fx_rates", value: JSON.stringify({ rates, updatedAt: "2026-10-01T00:00:00Z", source: "manual" }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue(ADMIN as never);
  vi.mocked(db.systemSetting.findUnique).mockResolvedValue(stored({ USD: 1, INR: 80 }) as never);
  vi.mocked(db.systemSetting.upsert).mockResolvedValue({} as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("admin only", () => {
  it.each([
    ["save", () => saveFxRatesAction({ rates: { INR: 83 } })],
    ["fetch", () => fetchLatestFxRatesAction(["INR"])],
  ])("%s is refused for a non-admin and writes nothing", async (_n, run) => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(NOT_ADMIN);
    await expect(run()).rejects.toBe(NOT_ADMIN);
    expect(db.systemSetting.upsert).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("saveFxRatesAction", () => {
  it("saves valid rates, pins USD to 1, and audits before/after", async () => {
    const res = await saveFxRatesAction({ rates: { inr: "83.5", eur: 0.92, usd: 99 } });
    expect(res).toMatchObject({ ok: true, rates: { USD: 1, INR: 83.5, EUR: 0.92 } });
    const written = JSON.parse(vi.mocked(db.systemSetting.upsert).mock.calls[0][0].update.value as string);
    expect(written.rates).toEqual({ USD: 1, INR: 83.5, EUR: 0.92 });
    expect(written.source).toBe("manual");
    expect(written.updatedAt).toEqual(expect.any(String));
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin_1",
        action: "admin.fx_rates_updated",
        metadata: expect.objectContaining({ before: { USD: 1, INR: 80 }, after: { USD: 1, INR: 83.5, EUR: 0.92 } }),
      }),
    );
  });

  it("rejects zero, negative, non-numeric and unknown codes instead of silently dropping them", async () => {
    for (const bad of [{ INR: 0 }, { INR: -3 }, { INR: "abc" }, { ZZZ: 2 }, { EUR: 1, GBP: 0 }]) {
      const res = await saveFxRatesAction({ rates: bad });
      expect(res.ok).toBe(false);
    }
    expect(db.systemSetting.upsert).not.toHaveBeenCalled();
  });
});

describe("fetchLatestFxRatesAction", () => {
  const api = (rates: Record<string, number>, ok = true, result = "success") =>
    vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 503, json: async () => ({ result, rates }) });

  it("stores only the requested currencies and keeps saved ones", async () => {
    vi.stubGlobal("fetch", api({ USD: 1, INR: 84.1, EUR: 0.9, JPY: 150 }));
    const res = await fetchLatestFxRatesAction(["inr", "eur", "usd"]);
    expect(res).toMatchObject({ ok: true, rates: { USD: 1, INR: 84.1, EUR: 0.9 } });
    expect((res as { rates: Record<string, number> }).rates.JPY).toBeUndefined();
    expect(JSON.parse(vi.mocked(db.systemSetting.upsert).mock.calls[0][0].update.value as string).source).toBe("open.er-api.com");
  });

  it("names a currency the service does not know instead of inventing a rate", async () => {
    vi.stubGlobal("fetch", api({ USD: 1, INR: 84 }));
    const res = await fetchLatestFxRatesAction(["INR", "AED"]);
    expect(res).toMatchObject({ ok: true });
    expect((res as { message: string }).message).toContain("AED");
    expect((res as { rates: Record<string, number> }).rates.AED).toBeUndefined();
  });

  it("fails cleanly (and saves nothing) when the service is down or malformed", async () => {
    vi.stubGlobal("fetch", api({}, false));
    expect((await fetchLatestFxRatesAction(["INR"])).ok).toBe(false);
    vi.stubGlobal("fetch", api({ INR: 80 }, true, "error"));
    expect((await fetchLatestFxRatesAction(["INR"])).ok).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect((await fetchLatestFxRatesAction(["INR"])).ok).toBe(false);
    expect(db.systemSetting.upsert).not.toHaveBeenCalled();
  });
});
