/**
 * Non-Invasive Observability & System Event Telemetry
 * Logs to Pino and persists structured events to the SystemEvent table.
 * All DB operations are wrapped in safe guards so observability NEVER throws or halts execution.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export type EventLevel = "info" | "warn" | "error";
export type EventSource = "queue" | "webhook" | "auth" | "billing" | "ai" | "api" | "system";

export interface SystemEventInput {
  level: EventLevel;
  source: EventSource;
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * Errors that are not application faults and only add noise to the admin
 * event log: the browser or proxy closed the connection mid-render (navigating
 * away, cancelled prefetch, aborted fetch). They still reach Sentry.
 */
export function isBenignRequestError(message: string | null | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("destination stream closed early") ||
    m.includes("the operation was aborted") ||
    m.includes("request aborted") ||
    m.includes("econnreset") ||
    m === "aborted"
  );
}

/**
 * Only the deployed app may write request errors into the shared event log.
 * Local dev servers and previews are usually pointed at the same database, so
 * their crashes (with local file paths in the message) were landing in the
 * production admin dashboard.
 */
export const persistsRequestErrors = (nodeEnv: string | undefined = process.env.NODE_ENV): boolean => nodeEnv === "production";

export async function recordSystemEvent({
  level,
  source,
  message,
  meta,
}: SystemEventInput): Promise<void> {
  // 1. Structured logging via Pino
  const logFn = level === "error" ? logger.error.bind(logger) : level === "warn" ? logger.warn.bind(logger) : logger.info.bind(logger);
  logFn({ source, ...meta }, message);

  // 2. Persist to SystemEvent non-invasively
  try {
    const formattedMessage = meta ? `${message} ${JSON.stringify(meta)}` : message;
    await db.systemEvent.create({
      data: {
        level,
        source,
        message: formattedMessage.slice(0, 2000),
      },
    });
  } catch (err) {
    // Fail-safe: DB logging failure must NEVER crash app requests or jobs
    logger.error({ err, source, level }, "[observe] Failed to record system event to database");
  }
}

export interface ObservabilitySummary {
  totalEvents: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  errorVelocityPerHour: number;
  bySource: Record<string, number>;
}

export function computeObservabilityMetrics(
  events: { level: string; source: string; createdAt: Date }[]
): ObservabilitySummary {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  let errorCount = 0;
  let warnCount = 0;
  let infoCount = 0;
  let lastHourErrors = 0;
  const bySource: Record<string, number> = {};

  for (const e of events) {
    if (e.level === "error") errorCount++;
    else if (e.level === "warn") warnCount++;
    else infoCount++;

    if (e.level === "error" && e.createdAt.getTime() >= oneHourAgo) {
      lastHourErrors++;
    }

    bySource[e.source] = (bySource[e.source] || 0) + 1;
  }

  return {
    totalEvents: events.length,
    errorCount,
    warnCount,
    infoCount,
    errorVelocityPerHour: lastHourErrors,
    bySource,
  };
}
