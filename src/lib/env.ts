/**
 * Single, validated source of truth for environment configuration.
 *
 * - Required vars throw at startup in production; in dev/test they fall back to
 *   safe demo values so the app keeps running with zero config.
 * - Optional integration vars (Stripe, Anthropic, S3, Resend, Upstash) are
 *   validated only when present. Their presence flips the matching adapter from
 *   stub mode to real mode — see `flags` below.
 */
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // --- core (required in prod) ---
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  APP_URL: z.string().url().optional(),

  // --- auth providers (optional) ---
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // --- LLM (optional → real AI when set) ---
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),

  // --- Stripe (optional → real billing when set) ---
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // --- email (optional → real mail when set) ---
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Cadence <no-reply@cadence.example>"),

  // --- object storage (optional → S3 when set) ---
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().url().optional(), // CDN / bucket public base

  // --- rate limiting (optional → distributed when set) ---
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // --- social OAuth (optional → real connect+publish per platform when set) ---
  // Base for callback URLs; defaults to APP_URL. Callback path is
  // /api/oauth/<platform>/callback.
  OAUTH_REDIRECT_BASE: z.string().url().optional(),
  // AES-256 key (base64 of 32 bytes) for encrypting stored tokens.
  TOKEN_ENC_KEY: z.string().optional(),
  OAUTH_LINKEDIN_CLIENT_ID: z.string().optional(),
  OAUTH_LINKEDIN_CLIENT_SECRET: z.string().optional(),
  // Meta app — covers facebook, instagram, threads.
  OAUTH_META_CLIENT_ID: z.string().optional(),
  OAUTH_META_CLIENT_SECRET: z.string().optional(),
  OAUTH_X_CLIENT_ID: z.string().optional(),
  OAUTH_X_CLIENT_SECRET: z.string().optional(),
  // Google app — covers youtube, gbp.
  OAUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
  OAUTH_TIKTOK_CLIENT_KEY: z.string().optional(),
  OAUTH_TIKTOK_CLIENT_SECRET: z.string().optional(),
  OAUTH_PINTEREST_CLIENT_ID: z.string().optional(),
  OAUTH_PINTEREST_CLIENT_SECRET: z.string().optional(),

  // --- ops ---
  CRON_SECRET: z.string().optional(), // guards /api/cron/tick in prod
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default(isProd ? "info" : "debug"),
  NEXT_PUBLIC_SHOW_DEMO: z.string().optional(), // "1" keeps demo-login hints visible
});

const raw = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  AUTH_SECRET: process.env.AUTH_SECRET ?? (isProd ? "" : "dev-secret-do-not-use-in-prod"),
  APP_URL: process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL,
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID || undefined,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET || undefined,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || undefined,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || undefined,
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM,
  S3_BUCKET: process.env.S3_BUCKET || undefined,
  S3_REGION: process.env.S3_REGION,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || undefined,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || undefined,
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL || undefined,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || undefined,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || undefined,
  OAUTH_REDIRECT_BASE: process.env.OAUTH_REDIRECT_BASE || undefined,
  TOKEN_ENC_KEY: process.env.TOKEN_ENC_KEY || undefined,
  OAUTH_LINKEDIN_CLIENT_ID: process.env.OAUTH_LINKEDIN_CLIENT_ID || undefined,
  OAUTH_LINKEDIN_CLIENT_SECRET: process.env.OAUTH_LINKEDIN_CLIENT_SECRET || undefined,
  OAUTH_META_CLIENT_ID: process.env.OAUTH_META_CLIENT_ID || undefined,
  OAUTH_META_CLIENT_SECRET: process.env.OAUTH_META_CLIENT_SECRET || undefined,
  OAUTH_X_CLIENT_ID: process.env.OAUTH_X_CLIENT_ID || undefined,
  OAUTH_X_CLIENT_SECRET: process.env.OAUTH_X_CLIENT_SECRET || undefined,
  OAUTH_GOOGLE_CLIENT_ID: process.env.OAUTH_GOOGLE_CLIENT_ID || undefined,
  OAUTH_GOOGLE_CLIENT_SECRET: process.env.OAUTH_GOOGLE_CLIENT_SECRET || undefined,
  OAUTH_TIKTOK_CLIENT_KEY: process.env.OAUTH_TIKTOK_CLIENT_KEY || undefined,
  OAUTH_TIKTOK_CLIENT_SECRET: process.env.OAUTH_TIKTOK_CLIENT_SECRET || undefined,
  OAUTH_PINTEREST_CLIENT_ID: process.env.OAUTH_PINTEREST_CLIENT_ID || undefined,
  OAUTH_PINTEREST_CLIENT_SECRET: process.env.OAUTH_PINTEREST_CLIENT_SECRET || undefined,
  CRON_SECRET: process.env.CRON_SECRET || undefined,
  LOG_LEVEL: process.env.LOG_LEVEL,
  NEXT_PUBLIC_SHOW_DEMO: process.env.NEXT_PUBLIC_SHOW_DEMO || undefined,
};

const parsed = schema.safeParse(raw);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  if (isProd) {
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // dev/test: warn once, continue with defaults where possible
  console.warn(`[env] configuration warnings (non-fatal in ${raw.NODE_ENV ?? "development"}):\n${issues}`);
}

export const env = (parsed.success ? parsed.data : schema.parse({ ...raw, AUTH_SECRET: "dev-secret-do-not-use-in-prod" }));

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

/** Which integrations are live vs. stubbed, derived from what's configured. */
export const flags = {
  realAI: !!env.ANTHROPIC_API_KEY,
  realBilling: !!env.STRIPE_SECRET_KEY,
  realEmail: !!env.RESEND_API_KEY,
  realStorage: !!env.S3_BUCKET && !!env.S3_ACCESS_KEY_ID,
  realWebhooks: true, // webhook dispatcher always does real HTTP now
  distributedRateLimit: !!env.UPSTASH_REDIS_REST_URL && !!env.UPSTASH_REDIS_REST_TOKEN,
  googleAuth: !!env.AUTH_GOOGLE_ID && !!env.AUTH_GOOGLE_SECRET,
  showDemoHints: !isProduction || env.NEXT_PUBLIC_SHOW_DEMO === "1",
} as const;

/**
 * Which social platforms have real OAuth credentials configured. A platform
 * not listed here uses the manual handle-entry stub connect.
 * (bluesky is app-password auth — always available, handled separately.)
 */
export const socialProviders = {
  linkedin: !!env.OAUTH_LINKEDIN_CLIENT_ID && !!env.OAUTH_LINKEDIN_CLIENT_SECRET,
  facebook: !!env.OAUTH_META_CLIENT_ID && !!env.OAUTH_META_CLIENT_SECRET,
  instagram: !!env.OAUTH_META_CLIENT_ID && !!env.OAUTH_META_CLIENT_SECRET,
  threads: !!env.OAUTH_META_CLIENT_ID && !!env.OAUTH_META_CLIENT_SECRET,
  x: !!env.OAUTH_X_CLIENT_ID && !!env.OAUTH_X_CLIENT_SECRET,
  youtube: !!env.OAUTH_GOOGLE_CLIENT_ID && !!env.OAUTH_GOOGLE_CLIENT_SECRET,
  gbp: !!env.OAUTH_GOOGLE_CLIENT_ID && !!env.OAUTH_GOOGLE_CLIENT_SECRET,
  tiktok: !!env.OAUTH_TIKTOK_CLIENT_KEY && !!env.OAUTH_TIKTOK_CLIENT_SECRET,
  pinterest: !!env.OAUTH_PINTEREST_CLIENT_ID && !!env.OAUTH_PINTEREST_CLIENT_SECRET,
  bluesky: true,
} as const;

export type SocialProviderKey = keyof typeof socialProviders;

export function oauthRedirectUri(platform: string): string {
  const base = (env.OAUTH_REDIRECT_BASE ?? appUrl()).replace(/\/$/, "");
  return `${base}/api/oauth/${platform}/callback`;
}

export function appUrl(path = ""): string {
  const base =
    env.APP_URL ??
    (isProduction ? "https://cadence.example" : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
