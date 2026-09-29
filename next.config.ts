import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import path from "node:path";

const isProd = process.env.NODE_ENV === "production";

// Pragmatic CSP. Next's App Router injects inline bootstrap scripts, so a
// nonce-only policy needs middleware wiring — 'unsafe-inline' is the tradeoff
// here. Tighten to nonces if the threat model needs it (see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
// Razorpay Checkout runs in the page: its script loads from checkout.razorpay.com,
// it opens a payment iframe on api.razorpay.com, and it calls both plus its
// telemetry host. Without these the modal silently fails to load and a customer
// simply cannot pay. See src/app/(app)/settings/billing/checkout.
const RZP_SCRIPT = "https://checkout.razorpay.com";
const RZP_FRAME = "https://api.razorpay.com https://checkout.razorpay.com";
const RZP_CONNECT = "https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com";
const RZP_ASSETS = "https://cdn.razorpay.com https://badges.razorpay.com";

const TURNSTILE = "https://challenges.cloudflare.com";
const GTAG_SCRIPT = "https://www.googletagmanager.com";
const GTAG_CONNECT =
  "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com";

// Google Picker (components/drive-picker.tsx): loads apis.google.com's JS,
// opens its own dialog in a docs.google.com iframe, and the dialog itself
// calls googleapis.com directly from the browser. Without all three the
// picker widget silently fails to open — same "the feature is wired up in
// code but CSP blocks it at runtime" shape as the Razorpay entries above.
const GOOGLE_PICKER_SCRIPT = "https://apis.google.com";
const GOOGLE_PICKER_FRAME = "https://docs.google.com https://drive.google.com";
const GOOGLE_PICKER_CONNECT = "https://*.googleapis.com";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${RZP_SCRIPT} ${TURNSTILE} ${GTAG_SCRIPT} ${GOOGLE_PICKER_SCRIPT}` +
    (isProd ? "" : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'",
  // The Razorpay payment iframe + Google Picker's own dialog iframe.
  // frame-ancestors below is unrelated — that governs who may frame us, and
  // stays 'none'.
  `frame-src 'self' ${RZP_FRAME} ${TURNSTILE} ${GOOGLE_PICKER_FRAME}`,
  // 'self' + inline data/blob previews, demo avatars, and common object-storage
  // hosts (Supabase Storage, Cloudflare R2, AWS S3, DO Spaces) for uploaded media.
  "img-src 'self' data: blob: https://randomuser.me https://*.supabase.co " +
    "https://*.r2.dev https://*.r2.cloudflarestorage.com https://*.s3.amazonaws.com " +
    "https://*.amazonaws.com https://*.digitaloceanspaces.com " +
    "https://images.unsplash.com https://plus.unsplash.com " +
    "https://*.googleusercontent.com " +
    RZP_ASSETS +
    ` ${GTAG_CONNECT}`,
  `font-src 'self' data: ${RZP_ASSETS}`,
  // <video>/<audio> playback of uploaded media from object storage.
  "media-src 'self' blob: https://*.supabase.co https://*.r2.dev " +
    "https://*.r2.cloudflarestorage.com https://*.s3.amazonaws.com " +
    "https://*.amazonaws.com https://*.digitaloceanspaces.com",
  // 'self' + object-storage hosts for presigned direct-to-bucket uploads.
  "connect-src 'self' https://*.supabase.co https://*.r2.dev " +
    "https://*.r2.cloudflarestorage.com https://*.s3.amazonaws.com " +
    "https://*.amazonaws.com https://*.digitaloceanspaces.com " +
    RZP_CONNECT +
    ` ${TURNSTILE} ${GTAG_CONNECT} ${GOOGLE_PICKER_CONNECT}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://api.razorpay.com",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // OAuth popups/redirects need opener access; same-origin-allow-popups keeps
  // COOP protection without breaking provider flows. CORP same-origin keeps
  // media/API responses from being embedded cross-origin.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  // Standalone output for the Docker image (server + minimal node_modules).
  // Next 16 throws "next start does not work with output: standalone" if started
  // with standalone enabled outside a container. Enable only when BUILD_STANDALONE=1.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  // All imagery is local (public/media, public/illustrations), generated
  // client-side (gradient identicons), or randomuser.me avatars.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "multipost-studio",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
