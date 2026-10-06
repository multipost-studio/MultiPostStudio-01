import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import v8 from "node:v8";
import { env, flags, isProduction } from "@/lib/env";
import { decryptToken, encryptToken } from "@/lib/social/crypto";
import {
  externalTimeout,
  localTimeout,
  mb,
  rateLatency,
  timedFetch,
  type ProbeDef,
  type ProbeOutcome,
} from "./probe-kit";

/**
 * Probes for the services this app depends on. Where a provider has a free,
 * read-only endpoint the probe calls it for real (S3 HeadBucket, Redis PING,
 * Anthropic model list, Resend domains, Stripe balance, Razorpay payments,
 * Gmail SMTP login) and reports the measured round-trip. Nothing is inferred
 * from "is the env var set" when a live check is possible. Optional services
 * that are not configured report `skipped`, not a failure.
 */

const serverless = () => !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/** Rate a provider's HTTP status + latency into a probe outcome. */
function httpOutcome(label: string, status: number, ms: number, slowAt: number, failAt: number, details: ProbeOutcome["details"]): ProbeOutcome {
  const base = { latencyMs: ms, details: { ...details, httpStatus: status } };
  if (status === 401 || status === 403) return { ...base, status: "unhealthy", message: `${label} rejected the credentials (HTTP ${status}).` };
  if (status === 429) return { ...base, status: "degraded", message: `${label} is rate limiting this key (HTTP 429).` };
  if (status >= 500) return { ...base, status: "degraded", message: `${label} returned a server error (HTTP ${status}).` };
  if (status < 200 || status >= 300) return { ...base, status: "degraded", message: `${label} answered with unexpected HTTP ${status}.` };
  const rating = rateLatency(ms, slowAt, failAt);
  return { ...base, status: rating, message: rating === "healthy" ? `${label} reachable, credentials accepted (${ms}ms).` : `${label} is slow: ${ms}ms (slow above ${slowAt}ms).` };
}

export const storageProbe: ProbeDef = {
  id: "storage",
  name: "Media Asset Storage",
  category: "infrastructure",
  description: "With S3 configured, sends a real HeadBucket request with your credentials. Without it, checks that the upload folder is writable.",
  timeoutMs: externalTimeout,
  async run({ config }) {
    const t = config.thresholds;
    if (flags.realStorage) {
      const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
      const client = new S3Client({
        region: env.S3_REGION,
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
      });
      const details = {
        provider: env.S3_ENDPOINT ? new URL(env.S3_ENDPOINT).host : "aws-s3",
        bucket: env.S3_BUCKET ?? null,
        region: env.S3_REGION,
        publicUrlConfigured: !!env.S3_PUBLIC_URL,
      };
      const start = performance.now();
      try {
        await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET! }));
      } catch (err) {
        const name = (err as { name?: string; $metadata?: { httpStatusCode?: number } }).name ?? "Error";
        const code = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        const ms = Math.round(performance.now() - start);
        return { status: "unhealthy", latencyMs: ms, details: { ...details, error: name, httpStatus: code ?? null }, message: `Bucket "${env.S3_BUCKET}" is not accessible: ${name}${code ? ` (HTTP ${code})` : ""}.` };
      } finally {
        client.destroy();
      }
      const ms = Math.round(performance.now() - start);
      const rating = rateLatency(ms, t.externalDegradedMs, t.externalUnhealthyMs);
      return { status: rating, latencyMs: ms, details, message: rating === "healthy" ? `Bucket "${env.S3_BUCKET}" reachable (${ms}ms).` : `Bucket "${env.S3_BUCKET}" is slow: ${ms}ms.` };
    }

    const dir = path.join(process.cwd(), "public", "uploads");
    let writable = true;
    try {
      await mkdir(dir, { recursive: true });
      await access(dir, constants.W_OK);
    } catch {
      writable = false;
    }
    const details = { provider: "local-disk", writable, serverless: serverless() };
    if (serverless() || !writable) {
      return { status: "unhealthy", details, message: "No object storage is configured and the filesystem is not writable here, so uploads will fail. Set S3_BUCKET and credentials." };
    }
    if (isProduction) return { status: "degraded", details, message: "Uploads go to local disk, which is not shared or durable across instances. Configure S3-compatible storage." };
    return { status: "healthy", details, message: "Local upload folder is writable (development)." };
  },
};

export const rateLimitProbe: ProbeDef = {
  id: "rate_limit",
  name: "Distributed Rate Limiter",
  category: "infrastructure",
  description: "With Upstash Redis configured, sends a real PING and times it. Without it, reports that limits are per-instance.",
  timeoutMs: externalTimeout,
  async run({ config }) {
    const t = config.thresholds;
    if (!flags.distributedRateLimit) {
      return {
        status: isProduction ? "degraded" : "skipped",
        details: { distributed: false },
        message: isProduction
          ? "Rate limits are per-instance (in memory). Add Upstash Redis so limits hold across instances."
          : "In-memory rate limiting (development). Upstash Redis is not configured.",
      };
    }
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! });
    const start = performance.now();
    const pong = await redis.ping();
    const ms = Math.round(performance.now() - start);
    const details = { distributed: true, host: new URL(env.UPSTASH_REDIS_REST_URL!).host, reply: String(pong) };
    if (pong !== "PONG") return { status: "unhealthy", latencyMs: ms, details, message: `Unexpected reply to PING: ${String(pong).slice(0, 40)}` };
    const rating = rateLatency(ms, t.externalDegradedMs, t.externalUnhealthyMs);
    return { status: rating, latencyMs: ms, details, message: rating === "healthy" ? `Redis answered PING in ${ms}ms.` : `Redis is slow: ${ms}ms.` };
  },
};

export const aiProbe: ProbeDef = {
  id: "ai",
  name: "AI Provider",
  category: "integration",
  description: "With a platform Anthropic key, lists models from the real API to prove the key works. Without one, reports the fallback mode.",
  timeoutMs: externalTimeout,
  async run({ config }) {
    const t = config.thresholds;
    if (!env.ANTHROPIC_API_KEY) {
      return {
        status: "skipped",
        details: { platformKey: false, byok: flags.aiByok },
        message: flags.aiByok ? "No platform key; customers connect their own AI keys (BYOK is on)." : "No platform key configured; AI features use deterministic templates.",
      };
    }
    const { res, ms } = await timedFetch(
      "https://api.anthropic.com/v1/models?limit=1",
      { headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } },
      t.externalUnhealthyMs,
    );
    return httpOutcome("Anthropic API", res.status, ms, t.externalDegradedMs, t.externalUnhealthyMs, { platformKey: true, byok: flags.aiByok, model: env.ANTHROPIC_MODEL });
  },
};

export const emailProbe: ProbeDef = {
  id: "email",
  name: "Transactional Email",
  category: "integration",
  description: "Resend: calls the domains API with your key. Gmail: performs a real SMTP login. Neither sends a message.",
  timeoutMs: externalTimeout,
  async run({ config }) {
    const t = config.thresholds;
    if (flags.emailProvider === "resend") {
      const { res, ms } = await timedFetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } }, t.externalUnhealthyMs);
      if (res.status === 401) {
        const body = (await res.json().catch(() => ({}))) as { name?: string };
        // A send-only key cannot list domains; that is a valid, working key.
        if (body.name === "restricted_api_key") {
          return { status: rateLatency(ms, t.externalDegradedMs, t.externalUnhealthyMs), latencyMs: ms, details: { provider: "resend", keyScope: "send-only" }, message: `Resend accepted the send-only key (${ms}ms).` };
        }
      }
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { data?: { status?: string }[] };
        const domains = body.data ?? [];
        const verified = domains.filter((d) => d.status === "verified").length;
        const details = { provider: "resend", domains: domains.length, verifiedDomains: verified };
        if (verified === 0) return { status: "degraded", latencyMs: ms, details, message: "Resend key works but has no verified sending domain." };
        return { ...httpOutcome("Resend", res.status, ms, t.externalDegradedMs, t.externalUnhealthyMs, details), message: `Resend reachable · ${verified} verified domain(s) (${ms}ms).` };
      }
      return httpOutcome("Resend", res.status, ms, t.externalDegradedMs, t.externalUnhealthyMs, { provider: "resend" });
    }
    if (flags.emailProvider === "gmail") {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({ service: "gmail", auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } });
      const start = performance.now();
      try {
        await transport.verify();
      } finally {
        transport.close();
      }
      const ms = Math.round(performance.now() - start);
      const rating = rateLatency(ms, t.externalDegradedMs, t.externalUnhealthyMs);
      return { status: rating, latencyMs: ms, details: { provider: "gmail" }, message: rating === "healthy" ? `Gmail SMTP login verified (${ms}ms).` : `Gmail SMTP is slow: ${ms}ms.` };
    }
    return {
      status: isProduction ? "degraded" : "skipped",
      details: { provider: "stub" },
      message: isProduction ? "No email provider configured: verification, invite and reset emails are not delivered." : "Emails are logged, not sent (development).",
    };
  },
};

export const billingProbe: ProbeDef = {
  id: "billing",
  name: "Billing Provider",
  category: "integration",
  description: "Stripe: reads the account balance. Razorpay: lists one payment. Both are read-only calls with your live key.",
  timeoutMs: externalTimeout,
  async run({ config }) {
    const t = config.thresholds;
    if (flags.billingProvider === "stripe") {
      const { res, ms } = await timedFetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } }, t.externalUnhealthyMs);
      const details = { provider: "stripe", webhookSecretSet: !!env.STRIPE_WEBHOOK_SECRET, mode: env.STRIPE_SECRET_KEY?.startsWith("sk_live") ? "live" : "test" };
      const out = httpOutcome("Stripe", res.status, ms, t.externalDegradedMs, t.externalUnhealthyMs, details);
      return !env.STRIPE_WEBHOOK_SECRET && out.status === "healthy" ? { ...out, status: "degraded", message: "Stripe key works but STRIPE_WEBHOOK_SECRET is missing, so subscription events will be rejected." } : out;
    }
    if (flags.billingProvider === "razorpay") {
      const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET ?? ""}`).toString("base64");
      const { res, ms } = await timedFetch("https://api.razorpay.com/v1/payments?count=1", { headers: { Authorization: `Basic ${auth}` } }, t.externalUnhealthyMs);
      const details = { provider: "razorpay", webhookSecretSet: !!env.RAZORPAY_WEBHOOK_SECRET, mode: env.RAZORPAY_KEY_ID?.startsWith("rzp_live") ? "live" : "test" };
      const out = httpOutcome("Razorpay", res.status, ms, t.externalDegradedMs, t.externalUnhealthyMs, details);
      return !env.RAZORPAY_WEBHOOK_SECRET && out.status === "healthy" ? { ...out, status: "degraded", message: "Razorpay key works but RAZORPAY_WEBHOOK_SECRET is missing, so payment events will be rejected." } : out;
    }
    return {
      status: isProduction ? "degraded" : "skipped",
      details: { provider: "stub" },
      message: isProduction ? "No billing provider configured: checkouts run in stub mode and no real payments are taken." : "Billing is in stub mode (development).",
    };
  },
};

export const cryptoProbe: ProbeDef = {
  id: "crypto",
  name: "OAuth Token Encryption",
  category: "security",
  description: "Encrypts and decrypts a random value with the live key to prove stored social tokens can be read back.",
  timeoutMs: localTimeout,
  async run() {
    const keyBytes = env.TOKEN_ENC_KEY ? Buffer.from(env.TOKEN_ENC_KEY, "base64").length : 0;
    const dedicated = keyBytes === 32;
    const details = { keySource: dedicated ? "TOKEN_ENC_KEY" : "derived from AUTH_SECRET", keyBytes };
    const sample = `health-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    try {
      const back = decryptToken(encryptToken(sample));
      if (back !== sample) return { status: "unhealthy", details, message: "Decrypting a freshly encrypted value returned different data." };
    } catch (err) {
      return { status: "unhealthy", details, message: `Token encryption failed: ${err instanceof Error ? err.message.slice(0, 160) : "unknown error"}` };
    }
    if (!dedicated) return { status: "degraded", details, message: "Round-trip works, but TOKEN_ENC_KEY is not a valid base64 32-byte key, so the AUTH_SECRET-derived key is in use." };
    return { status: "healthy", details, message: "AES-256-GCM round-trip succeeded with the dedicated key." };
  },
};

export const environmentProbe: ProbeDef = {
  id: "environment",
  name: "Environment Configuration",
  category: "security",
  description: "Checks that required deployment variables are present. Only names are reported, never values.",
  timeoutMs: localTimeout,
  async run() {
    const placeholderSecret = env.AUTH_SECRET === "build-placeholder-secret-not-usable";
    const checks: { name: string; ok: boolean; requiredInProd: boolean }[] = [
      { name: "DATABASE_URL", ok: !!env.DATABASE_URL, requiredInProd: true },
      { name: "AUTH_SECRET", ok: !placeholderSecret, requiredInProd: true },
      { name: "APP_URL", ok: !!env.APP_URL, requiredInProd: true },
      { name: "CRON_SECRET", ok: !!env.CRON_SECRET, requiredInProd: true },
      { name: "TOKEN_ENC_KEY", ok: !!env.TOKEN_ENC_KEY, requiredInProd: true },
      { name: "DIRECT_URL", ok: !!process.env.DIRECT_URL, requiredInProd: false },
    ];
    const missing = checks.filter((c) => !c.ok);
    const missingRequired = missing.filter((c) => c.requiredInProd).map((c) => c.name);
    const details = { environment: env.NODE_ENV ?? "unknown", configured: checks.length - missing.length, missing: missing.map((m) => m.name).join(", ") || null };
    if (isProduction && !checks[1].ok) return { status: "unhealthy", details, message: "AUTH_SECRET is still the public placeholder: sessions and tokens are not secure." };
    if (isProduction && missingRequired.length > 0) return { status: "degraded", details, message: `Missing in production: ${missingRequired.join(", ")}.` };
    if (!isProduction) return { status: "healthy", details, message: `Development environment · ${missing.length ? `${missing.length} optional variable(s) unset` : "all variables set"}.` };
    return { status: "healthy", details, message: `All ${checks.length - missing.length} production variables are set.` };
  },
};

export const runtimeProbe: ProbeDef = {
  id: "runtime",
  name: "Runtime & Memory",
  category: "infrastructure",
  description: "Reads Node's heap use against its real limit, plus version, uptime, region and the deployed commit.",
  timeoutMs: localTimeout,
  async run({ config }) {
    const mem = process.memoryUsage();
    const limit = v8.getHeapStatistics().heap_size_limit;
    const usedPct = Math.round((mem.heapUsed / limit) * 1000) / 10;
    const details = {
      node: process.version,
      platform: process.platform,
      uptimeSec: Math.round(process.uptime()),
      rssMB: mb(mem.rss),
      heapUsedMB: mb(mem.heapUsed),
      heapLimitMB: mb(limit),
      heapUsedPct: usedPct,
      region: process.env.VERCEL_REGION ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
    };
    const limitPct = config.thresholds.memoryPct;
    if (usedPct >= Math.min(99, limitPct + 10)) return { status: "unhealthy", details, message: `Heap is ${usedPct}% of its limit (${details.heapUsedMB}/${details.heapLimitMB} MB).` };
    if (usedPct >= limitPct) return { status: "degraded", details, message: `Heap is ${usedPct}% of its limit (alert at ${limitPct}%).` };
    return { status: "healthy", details, message: `Heap ${usedPct}% of limit · ${details.heapUsedMB} MB used · Node ${process.version}` };
  },
};

export const SERVICE_PROBES: ProbeDef[] = [storageProbe, rateLimitProbe, aiProbe, emailProbe, billingProbe, cryptoProbe, environmentProbe, runtimeProbe];
