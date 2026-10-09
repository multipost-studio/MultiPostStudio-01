"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { sanitizeRates, type FxRates } from "@/lib/revenue";
import { FX_KEY, getFxRates } from "@/lib/revenue-db";

export type FxResult = { ok: true; message: string; rates?: Record<string, number> } | { ok: false; error: string };

const RATES_URL = "https://open.er-api.com/v6/latest/USD";

async function persist(rates: Record<string, number>, source: string, adminId: string): Promise<FxRates> {
  const value: FxRates = { rates: sanitizeRates(rates), updatedAt: new Date().toISOString(), source };
  await db.systemSetting.upsert({
    where: { key: FX_KEY },
    create: { key: FX_KEY, value: JSON.stringify(value), updatedBy: adminId },
    update: { value: JSON.stringify(value), updatedBy: adminId },
  });
  return value;
}

/** Save the exchange rates the admin typed in (1 USD = N of each currency). */
export async function saveFxRatesAction(input: { rates: Record<string, unknown> }): Promise<FxResult> {
  const admin = await requireAdminPermission("billing.manage");
  const clean = sanitizeRates(input.rates ?? {});
  const supplied = Object.keys(input.rates ?? {}).filter((k) => k.toUpperCase() !== "USD");
  const dropped = supplied.filter((k) => !(k.toUpperCase() in clean));
  if (dropped.length) return { ok: false, error: `Invalid rate for ${dropped.map((d) => d.toUpperCase()).join(", ")}. Use a positive number.` };
  try {
    const before = await getFxRates();
    const saved = await persist(clean, "manual", admin.id);
    await logAudit({
      actorId: admin.id,
      action: "admin.fx_rates_updated",
      targetType: "system",
      targetId: FX_KEY,
      metadata: { before: before.rates, after: saved.rates, source: "manual" },
    });
    revalidatePath("/admin/revenue");
    return { ok: true, message: "Exchange rates saved", rates: saved.rates };
  } catch (err) {
    logger.error({ err }, "fx rates save failed");
    return { ok: false, error: "Couldn't save the rates." };
  }
}

/**
 * Pull current rates for the requested currencies (plus any already saved) from a
 * free public rates API. Only currencies you ask for are stored; nothing is
 * invented if the service lacks one.
 */
export async function fetchLatestFxRatesAction(currencies: string[]): Promise<FxResult> {
  const admin = await requireAdminPermission("billing.manage");
  const want = [...new Set(currencies.map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)))].slice(0, 60);
  try {
    const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return { ok: false, error: `Rate service answered ${res.status}. Enter rates by hand or try again.` };
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) return { ok: false, error: "Rate service returned no data. Enter rates by hand or try again." };

    const before = await getFxRates();
    const next: Record<string, number> = { ...before.rates };
    const missing: string[] = [];
    for (const c of want) {
      if (c === "USD") continue;
      const r = data.rates[c];
      if (typeof r === "number" && r > 0) next[c] = r;
      else missing.push(c);
    }
    const saved = await persist(next, "open.er-api.com", admin.id);
    await logAudit({
      actorId: admin.id,
      action: "admin.fx_rates_updated",
      targetType: "system",
      targetId: FX_KEY,
      metadata: { before: before.rates, after: saved.rates, source: "open.er-api.com", missing },
    });
    revalidatePath("/admin/revenue");
    return {
      ok: true,
      rates: saved.rates,
      message: missing.length ? `Rates updated. No rate available for ${missing.join(", ")}.` : "Latest rates fetched and saved",
    };
  } catch (err) {
    logger.warn({ err }, "fx fetch failed");
    return { ok: false, error: "Couldn't reach the rate service. Enter rates by hand or try again." };
  }
}
