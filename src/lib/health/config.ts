import { z } from "zod";

/**
 * Admin-tunable health configuration. Stored as one JSON value in
 * SystemSetting("health_config"). Everything the probes compare against lives
 * here, so "healthy" means what the operator says it means, not a number baked
 * into code. Pure module: shared by server actions, probes and the settings UI.
 */

export const PROBE_IDS = [
  "database",
  "migrations",
  "storage",
  "rate_limit",
  "ai",
  "email",
  "billing",
  "crypto",
  "worker",
  "publishing",
  "overdue",
  "social",
  "environment",
  "runtime",
] as const;
export type ProbeId = (typeof PROBE_IDS)[number];

export const RECORD_EVERY_OPTIONS = [0, 5, 10, 15, 30, 60] as const;

const int = (min: number, max: number) => z.number().int().min(min).max(max);

export const thresholdsSchema = z
  .object({
    dbDegradedMs: int(50, 10_000),
    dbUnhealthyMs: int(100, 30_000),
    externalDegradedMs: int(200, 20_000),
    externalUnhealthyMs: int(500, 30_000),
    workerStaleSec: int(60, 86_400),
    stuckJobMin: int(1, 240),
    overdueMin: int(1, 1_440),
    failureRatePct: int(1, 100),
    memoryPct: int(50, 99),
    tokenExpiryDays: int(1, 60),
  })
  .strict()
  .refine((t) => t.dbUnhealthyMs > t.dbDegradedMs, {
    message: "Database unhealthy threshold must be higher than the degraded threshold",
    path: ["dbUnhealthyMs"],
  })
  .refine((t) => t.externalUnhealthyMs > t.externalDegradedMs, {
    message: "External-service timeout must be higher than the slow threshold",
    path: ["externalUnhealthyMs"],
  });

export type HealthThresholds = z.infer<typeof thresholdsSchema>;

export const configSchema = z
  .object({
    thresholds: thresholdsSchema,
    muted: z.array(z.enum(PROBE_IDS)).max(PROBE_IDS.length),
    recordEveryMin: z
      .number()
      .int()
      .refine((n) => (RECORD_EVERY_OPTIONS as readonly number[]).includes(n), {
        message: `must be one of ${RECORD_EVERY_OPTIONS.join(", ")}`,
      }),
    retentionDays: int(1, 365),
  })
  .strict();

export type HealthConfig = z.infer<typeof configSchema>;

export const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  thresholds: {
    dbDegradedMs: 500,
    dbUnhealthyMs: 2_500,
    externalDegradedMs: 1_500,
    externalUnhealthyMs: 6_000,
    workerStaleSec: 300,
    stuckJobMin: 15,
    overdueMin: 10,
    failureRatePct: 20,
    memoryPct: 85,
    tokenExpiryDays: 7,
  },
  muted: [],
  recordEveryMin: 15,
  retentionDays: 30,
};

export const THRESHOLD_FIELDS: {
  key: keyof HealthThresholds;
  label: string;
  unit: string;
  help: string;
  min: number;
  max: number;
}[] = [
  { key: "dbDegradedMs", label: "Database slow at", unit: "ms", help: "Round-trip latency above this marks the database degraded.", min: 50, max: 10_000 },
  { key: "dbUnhealthyMs", label: "Database failing at", unit: "ms", help: "Latency above this marks the database unhealthy.", min: 100, max: 30_000 },
  { key: "externalDegradedMs", label: "External service slow at", unit: "ms", help: "Storage, Redis, AI, email and billing API round-trips above this are degraded.", min: 200, max: 20_000 },
  { key: "externalUnhealthyMs", label: "External service timeout", unit: "ms", help: "A probe that has not answered by now is unhealthy and is cut off.", min: 500, max: 30_000 },
  { key: "workerStaleSec", label: "Worker heartbeat stale after", unit: "s", help: "No scheduled-work tick for this long marks the worker degraded.", min: 60, max: 86_400 },
  { key: "stuckJobMin", label: "Job stuck after", unit: "min", help: "A publish job running longer than this (or with an expired lease) is stuck.", min: 1, max: 240 },
  { key: "overdueMin", label: "Post overdue after", unit: "min", help: "A scheduled post this far past its time and still unpublished is overdue.", min: 1, max: 1_440 },
  { key: "failureRatePct", label: "Publish failure rate", unit: "%", help: "Share of failed publishes in the last 24 hours that marks publishing degraded.", min: 1, max: 100 },
  { key: "memoryPct", label: "Memory use", unit: "%", help: "Share of the Node heap limit in use that marks the runtime degraded.", min: 50, max: 99 },
  { key: "tokenExpiryDays", label: "Token expiry warning", unit: "days", help: "Connected accounts whose token expires within this window are flagged.", min: 1, max: 60 },
];

export type ConfigParseResult = { ok: true; config: HealthConfig } | { ok: false; errors: string[] };

/**
 * Strictly validates untrusted config (an import file, a form submission).
 * Unknown keys are rejected rather than ignored, so a typo in an imported file
 * cannot silently leave a threshold at its default.
 */
export function parseHealthConfig(raw: unknown): ConfigParseResult {
  const parsed = configSchema.safeParse(raw);
  if (parsed.success) return { ok: true, config: { ...parsed.data, muted: [...new Set(parsed.data.muted)] } };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "config"}: ${i.message}`),
  };
}

/** Tolerant read for stored values: anything invalid falls back to defaults. */
export function normalizeHealthConfig(raw: unknown): HealthConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = (o.thresholds && typeof o.thresholds === "object" ? o.thresholds : {}) as Record<string, unknown>;
  const merged = {
    thresholds: {
      ...DEFAULT_HEALTH_CONFIG.thresholds,
      ...Object.fromEntries(Object.entries(t).filter(([k]) => k in DEFAULT_HEALTH_CONFIG.thresholds)),
    },
    muted: Array.isArray(o.muted) ? o.muted.filter((m) => (PROBE_IDS as readonly unknown[]).includes(m)) : [],
    recordEveryMin: typeof o.recordEveryMin === "number" ? o.recordEveryMin : DEFAULT_HEALTH_CONFIG.recordEveryMin,
    retentionDays: typeof o.retentionDays === "number" ? o.retentionDays : DEFAULT_HEALTH_CONFIG.retentionDays,
  };
  const res = parseHealthConfig(merged);
  return res.ok ? res.config : DEFAULT_HEALTH_CONFIG;
}
