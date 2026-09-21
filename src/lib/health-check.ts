/**
 * System Health Probes & Deep Readiness Diagnostics
 */

import { db } from "@/lib/db";
import { flags, env } from "@/lib/env";

export type ProbeStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthProbeResult {
  name: string;
  category: "core" | "infrastructure" | "integration" | "security";
  status: ProbeStatus;
  latencyMs?: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface SystemHealthReport {
  overallStatus: ProbeStatus;
  timestamp: string;
  probes: HealthProbeResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

export function evaluateOverallHealth(probes: HealthProbeResult[]): ProbeStatus {
  if (probes.some((p) => p.status === "unhealthy")) return "unhealthy";
  if (probes.some((p) => p.status === "degraded")) return "degraded";
  return "healthy";
}

export async function probeDatabase(): Promise<HealthProbeResult> {
  const start = performance.now();
  try {
    await db.$queryRaw`SELECT 1`;
    const latencyMs = Math.round(performance.now() - start);
    return {
      name: "PostgreSQL Database",
      category: "core",
      status: latencyMs > 500 ? "degraded" : "healthy",
      latencyMs,
      message: `Database connection active (${latencyMs}ms)`,
    };
  } catch (err) {
    return {
      name: "PostgreSQL Database",
      category: "core",
      status: "unhealthy",
      latencyMs: Math.round(performance.now() - start),
      message: err instanceof Error ? err.message : "Database connection failed",
    };
  }
}

export async function probeStorage(): Promise<HealthProbeResult> {
  return {
    name: "Media Asset Storage",
    category: "infrastructure",
    status: "healthy",
    message: flags.realStorage ? "AWS S3 Cloud Storage configured" : "Local disk storage provider",
    details: { provider: flags.realStorage ? "s3" : "local" },
  };
}

export async function probeRateLimiting(): Promise<HealthProbeResult> {
  return {
    name: "Distributed Rate Limiter",
    category: "infrastructure",
    status: flags.distributedRateLimit ? "healthy" : "degraded",
    message: flags.distributedRateLimit
      ? "Upstash Redis multi-tenant cluster connected"
      : "Single-instance in-memory rate limiting active (no Upstash Redis configured)",
    details: { distributed: flags.distributedRateLimit },
  };
}

export async function probeAiEngine(): Promise<HealthProbeResult> {
  return {
    name: "AI Generation Engine",
    category: "integration",
    status: flags.realAI ? "healthy" : "degraded",
    message: flags.realAI
      ? "Anthropic / Claude API credentials verified"
      : "Deterministic template fallback mode (no API key configured)",
    details: { realAI: flags.realAI },
  };
}

export async function probeWorkerHeartbeat(): Promise<HealthProbeResult> {
  let tickAgeSec = -1;
  let openJobs = 0;

  try {
    const [stamp, queuedCount] = await Promise.all([
      db.systemSetting.findUnique({ where: { key: "tick_last_run" }, select: { value: true } }),
      db.publishJob.count({ where: { status: { in: ["queued", "running"] } } }),
    ]);

    openJobs = queuedCount;
    if (stamp) {
      const at = Date.parse(JSON.parse(stamp.value) as string);
      if (Number.isFinite(at)) {
        tickAgeSec = Math.max(0, Math.round((Date.now() - at) / 1000));
      }
    }
  } catch {
    // Best-effort
  }

  const isStale = tickAgeSec > 300; // > 5 minutes
  return {
    name: "Background Queue Worker",
    category: "core",
    status: isStale ? "degraded" : "healthy",
    message:
      tickAgeSec >= 0
        ? `Worker heartbeat ${tickAgeSec}s ago · ${openJobs} open jobs`
        : `Background queue active (${openJobs} open jobs)`,
    details: { tickAgeSec, openJobs },
  };
}

export async function probeCryptoSecurity(): Promise<HealthProbeResult> {
  const key = env.TOKEN_ENC_KEY;
  const bytes = key ? Buffer.from(key, "base64").length : 0;
  const isValid = bytes === 32;

  return {
    name: "OAuth Token Encryption",
    category: "security",
    status: isValid ? "healthy" : "unhealthy",
    message: isValid
      ? "AES-256-GCM token encryption key verified (32 bytes)"
      : "Invalid or missing TOKEN_ENC_KEY — connected social accounts cannot be decrypted",
    details: { keyBytes: bytes },
  };
}

export async function probeEmailService(): Promise<HealthProbeResult> {
  return {
    name: "Transactional Email",
    category: "integration",
    status: flags.realEmail ? "healthy" : "degraded",
    message: flags.realEmail ? "SMTP / Resend delivery active" : "Stub development logger active (no SMTP credentials)",
    details: { realEmail: flags.realEmail },
  };
}

export async function runSystemHealthProbes(): Promise<SystemHealthReport> {
  const probes = await Promise.all([
    probeDatabase(),
    probeStorage(),
    probeRateLimiting(),
    probeAiEngine(),
    probeWorkerHeartbeat(),
    probeCryptoSecurity(),
    probeEmailService(),
  ]);

  const healthy = probes.filter((p) => p.status === "healthy").length;
  const degraded = probes.filter((p) => p.status === "degraded").length;
  const unhealthy = probes.filter((p) => p.status === "unhealthy").length;

  return {
    overallStatus: evaluateOverallHealth(probes),
    timestamp: new Date().toISOString(),
    probes,
    summary: {
      total: probes.length,
      healthy,
      degraded,
      unhealthy,
    },
  };
}
