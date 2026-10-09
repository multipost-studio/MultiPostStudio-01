import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * One row per call to a workspace's own AI provider: which provider and model, whether it worked, why not, how long it
 * took and how big the exchange was. The keys belong to the customers, so there is no platform cost to record; this
 * shows volume, failure rates and latency per provider so staff can see a provider degrading before customers say so.
 * No prompt or output text is ever stored.
 *
 * Fire and forget: logging must never slow or break the feature that made the call, so errors (including the table not
 * being migrated yet) are logged at warn level and swallowed.
 */
export const AI_LOG_RETENTION_DAYS = 90;

export type AiCallEntry = {
  workspaceId: string;
  provider: string;
  model: string;
  ok: boolean;
  reason?: string | null;
  latencyMs: number;
  inputChars: number;
  outputChars: number;
};

const clamp = (n: number, max: number) => (Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), max) : 0);

export function recordAiCall(e: AiCallEntry): void {
  try {
    void db.aiCallLog
      .create({
        data: {
          workspaceId: e.workspaceId,
          provider: e.provider.slice(0, 40),
          model: (e.model || "unknown").slice(0, 80),
          ok: e.ok,
          reason: e.ok ? null : (e.reason ?? "unknown").slice(0, 40),
          latencyMs: clamp(e.latencyMs, 3_600_000),
          inputChars: clamp(e.inputChars, 10_000_000),
          outputChars: clamp(e.outputChars, 10_000_000),
        },
      })
      .catch((err: unknown) => logger.warn({ err }, "ai call not logged"));
  } catch (err) {
    logger.warn({ err }, "ai call not logged");
  }
}

/** 0-100, or null when there were no calls. */
export function successRate(ok: number, total: number): number | null {
  return total > 0 ? Math.round((ok / total) * 1000) / 10 : null;
}
