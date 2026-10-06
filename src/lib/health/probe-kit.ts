import type { HealthConfig, ProbeId } from "./config";
import type { ProbeCategory, ProbeDetailValue, ProbeStatus } from "./types";

/**
 * Building blocks shared by every probe: the outcome shape, a timed fetch for
 * calling real provider APIs, a timeout wrapper and secret redaction for
 * anything that ends up in a stored message.
 */

export type ProbeContext = { config: HealthConfig; now: Date };

export type ProbeOutcome = {
  status: ProbeStatus;
  message: string;
  latencyMs?: number;
  details?: Record<string, ProbeDetailValue>;
};

export type ProbeDef = {
  id: ProbeId;
  name: string;
  category: ProbeCategory;
  description: string;
  /** Hard stop for this probe, derived from the admin's thresholds. */
  timeoutMs: (config: HealthConfig) => number;
  run: (ctx: ProbeContext) => Promise<ProbeOutcome>;
};

export const dbTimeout = (c: HealthConfig) => c.thresholds.dbUnhealthyMs + 1_000;
export const externalTimeout = (c: HealthConfig) => c.thresholds.externalUnhealthyMs;
export const localTimeout = () => 10_000;

export class ProbeTimeoutError extends Error {
  constructor(public readonly afterMs: number) {
    super(`Timed out after ${afterMs}ms`);
  }
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProbeTimeoutError(ms)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Latency rating against the admin's slow/failing thresholds. */
export function rateLatency(ms: number, degradedAt: number, unhealthyAt: number): ProbeStatus {
  if (ms >= unhealthyAt) return "unhealthy";
  if (ms >= degradedAt) return "degraded";
  return "healthy";
}

/** One real HTTP round-trip; returns the response and how long it took. */
export async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<{ res: Response; ms: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    return { res, ms: Math.round(performance.now() - start) };
  } finally {
    clearTimeout(timer);
  }
}

/** Strip any configured secret out of text before it is stored or shown. */
export function redact(text: string, secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 6 && out.includes(s)) out = out.split(s).join("[redacted]");
  }
  return out;
}

export function errorMessage(err: unknown, secrets: (string | undefined)[] = []): string {
  const raw = err instanceof Error ? err.message : String(err);
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return redact(oneLine, secrets).slice(0, 240) || "Unknown error";
}

export const mb = (bytes: number) => Math.round((bytes / 1_048_576) * 10) / 10;
