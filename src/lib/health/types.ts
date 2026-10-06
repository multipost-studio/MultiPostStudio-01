/**
 * Shared shapes for the health-probe system. Pure: no I/O, safe to import from
 * client components.
 */

/** `skipped` = an optional service that isn't configured. Never counts against overall health. */
export type ProbeStatus = "healthy" | "degraded" | "unhealthy" | "skipped";
export type ProbeCategory = "core" | "infrastructure" | "integration" | "security" | "application";

export const PROBE_STATUSES: ProbeStatus[] = ["healthy", "degraded", "unhealthy", "skipped"];
export const PROBE_CATEGORIES: ProbeCategory[] = ["core", "infrastructure", "integration", "security", "application"];

export type ProbeDetailValue = string | number | boolean | null;

export interface HealthProbeResult {
  id: string;
  name: string;
  category: ProbeCategory;
  status: ProbeStatus;
  /** What this probe actually checks, in plain words. */
  description: string;
  latencyMs?: number;
  message: string;
  details?: Record<string, ProbeDetailValue>;
  /** ISO time the probe finished. */
  checkedAt: string;
  /** Set when an admin muted this probe: still run and shown, but excluded from overall status and alerts. */
  muted?: boolean;
}

export interface HealthSummary {
  total: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  skipped: number;
  muted: number;
}

export interface SystemHealthReport {
  overallStatus: ProbeStatus;
  timestamp: string;
  probes: HealthProbeResult[];
  summary: HealthSummary;
}

/** A probe result read back from the history table. */
export interface StoredProbeResult {
  id: string;
  runId: string;
  probeId: string;
  name: string;
  category: ProbeCategory;
  status: ProbeStatus;
  latencyMs: number | null;
  message: string;
  trigger: string;
  createdAt: string;
}

export const TRIGGERS = ["manual", "auto", "page", "tick"] as const;
export type RunTrigger = (typeof TRIGGERS)[number];

export const RANGES = ["1h", "24h", "7d", "30d"] as const;
export type HealthRange = (typeof RANGES)[number];
export const RANGE_MS: Record<HealthRange, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};
export const RANGE_LABEL: Record<HealthRange, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};
