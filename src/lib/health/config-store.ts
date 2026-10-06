import { db } from "@/lib/db";
import { DEFAULT_HEALTH_CONFIG, normalizeHealthConfig, type HealthConfig } from "./config";

/** SystemSetting keys owned by the health module. */
export const CONFIG_KEY = "health_config";
export const STATE_KEY = "health_state";

export type HealthState = {
  /** ISO time a run was last written to history (drives auto-record throttling). */
  lastRecordedAt?: string;
  /** ISO time old history was last pruned. */
  lastPrunedAt?: string;
};

async function readJson(key: string): Promise<unknown> {
  const row = await db.systemSetting.findUnique({ where: { key }, select: { value: true } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return null;
  }
}

/** Saved config, or the defaults. Never throws: a broken settings row must not blind the monitor. */
export async function loadHealthConfig(): Promise<HealthConfig> {
  try {
    return normalizeHealthConfig(await readJson(CONFIG_KEY));
  } catch {
    return DEFAULT_HEALTH_CONFIG;
  }
}

export async function saveHealthConfig(config: HealthConfig, updatedBy: string): Promise<void> {
  const value = JSON.stringify(config);
  await db.systemSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value, updatedBy },
    update: { value, updatedBy },
  });
}

export async function resetHealthConfig(): Promise<void> {
  await db.systemSetting.deleteMany({ where: { key: CONFIG_KEY } });
}

export async function loadHealthState(): Promise<HealthState> {
  try {
    const raw = await readJson(STATE_KEY);
    return raw && typeof raw === "object" ? (raw as HealthState) : {};
  } catch {
    return {};
  }
}

export async function saveHealthState(patch: HealthState): Promise<void> {
  const current = await loadHealthState();
  const value = JSON.stringify({ ...current, ...patch });
  await db.systemSetting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value },
    update: { value },
  });
}
