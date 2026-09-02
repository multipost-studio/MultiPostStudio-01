import type { NextConfig } from "next";
import path from "node:path";

const isProd = process.env.NODE_ENV === "production";

// Pragmatic CSP. Next's App Router injects inline bootstrap scripts, so a
// nonce-only policy needs middleware wiring — 'unsafe-inline' is the tradeoff
// here. Tighten to nonces if the threat model needs it (see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (isProd ? "" : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://randomuser.me",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  // Standalone output for the Docker image (server + minimal node_modules).
  output: "standalone",
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

export default nextConfig;
