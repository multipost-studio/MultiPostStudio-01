import pino from "pino";
import { env, isProduction } from "@/lib/env";

/**
 * Structured JSON logger. Pretty-printed in dev, JSON lines in prod (ship to
 * any log aggregator). Never logs secrets — redact paths listed below.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.secret",
      "*.authorization",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
