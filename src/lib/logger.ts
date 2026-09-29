import pino from "pino";
import { env, isProduction } from "@/lib/env";

/**
 * Structured JSON logger. Pretty-printed in dev, JSON lines in prod (ship to
 * any log aggregator). Never logs secrets — redact paths listed below.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    // fast-redact paths match a property name at an exact nesting depth, not
    // a substring — "*.token" never matches "accessToken". Every actual
    // secret-bearing field name in the schema is listed explicitly, both
    // bare (top-level) and one level nested, since call sites log either
    // shape (e.g. logger.error({ err, token }, ...) vs logger.error({ err,
    // credential: { token } }, ...)).
    paths: [
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "token",
      "*.token",
      "accessToken",
      "*.accessToken",
      "refreshToken",
      "*.refreshToken",
      "secret",
      "*.secret",
      "twoFactorSecret",
      "*.twoFactorSecret",
      "authorization",
      "*.authorization",
      "apiKey",
      "*.apiKey",
      "encryptedApiKey",
      "*.encryptedApiKey",
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
