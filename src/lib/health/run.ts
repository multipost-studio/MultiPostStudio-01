import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { evaluateOverallHealth, summarize } from "./analytics";
import { loadHealthConfig } from "./config-store";
import { PROBE_IDS, type HealthConfig, type ProbeId } from "./config";
import { CORE_PROBES } from "./probes-core";
import { SERVICE_PROBES } from "./probes-services";
import { ProbeTimeoutError, errorMessage, withTimeout, type ProbeDef } from "./probe-kit";
import type { HealthProbeResult, SystemHealthReport } from "./types";

/** Every probe, in display order. */
export const PROBES: ProbeDef[] = [...CORE_PROBES, ...SERVICE_PROBES].sort(
  (a, b) => PROBE_IDS.indexOf(a.id) - PROBE_IDS.indexOf(b.id),
);

export const PROBE_BY_ID: Record<string, ProbeDef> = Object.fromEntries(PROBES.map((p) => [p.id, p]));

const SECRETS = () => [
  env.DATABASE_URL,
  env.ANTHROPIC_API_KEY,
  env.RESEND_API_KEY,
  env.GMAIL_APP_PASSWORD,
  env.S3_SECRET_ACCESS_KEY,
  env.S3_ACCESS_KEY_ID,
  env.UPSTASH_REDIS_REST_TOKEN,
  env.STRIPE_SECRET_KEY,
  env.RAZORPAY_KEY_SECRET,
  env.AUTH_SECRET,
  env.TOKEN_ENC_KEY,
];

/**
 * Runs one probe with a hard timeout. A probe can never throw out of here and
 * can never hang the page: a failure is itself a result (unhealthy), with any
 * configured secret scrubbed from the message.
 */
export async function runProbe(def: ProbeDef, config: HealthConfig, now = new Date()): Promise<HealthProbeResult> {
  const started = performance.now();
  const base = { id: def.id, name: def.name, category: def.category, description: def.description };
  try {
    const out = await withTimeout(def.run({ config, now }), def.timeoutMs(config));
    return {
      ...base,
      status: out.status,
      message: out.message,
      latencyMs: out.latencyMs,
      details: out.details,
      checkedAt: new Date().toISOString(),
      muted: config.muted.includes(def.id) || undefined,
    };
  } catch (err) {
    const elapsed = Math.round(performance.now() - started);
    if (err instanceof ProbeTimeoutError) {
      return { ...base, status: "unhealthy", latencyMs: elapsed, message: `Did not answer within ${err.afterMs}ms.`, checkedAt: new Date().toISOString(), muted: config.muted.includes(def.id) || undefined };
    }
    logger.warn({ err, probe: def.id }, "health probe threw");
    return { ...base, status: "unhealthy", latencyMs: elapsed, message: errorMessage(err, SECRETS()), checkedAt: new Date().toISOString(), muted: config.muted.includes(def.id) || undefined };
  }
}

export function buildReport(probes: HealthProbeResult[]): SystemHealthReport {
  return {
    overallStatus: evaluateOverallHealth(probes),
    timestamp: new Date().toISOString(),
    probes,
    summary: summarize(probes),
  };
}

/** Runs all probes (or a subset) in parallel against the saved config. */
export async function runSystemHealthProbes(opts: { only?: ProbeId[]; config?: HealthConfig } = {}): Promise<SystemHealthReport> {
  const config = opts.config ?? (await loadHealthConfig());
  const defs = opts.only ? PROBES.filter((p) => opts.only!.includes(p.id)) : PROBES;
  const now = new Date();
  const probes = await Promise.all(defs.map((d) => runProbe(d, config, now)));
  return buildReport(probes);
}
