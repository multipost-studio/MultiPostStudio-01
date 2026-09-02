import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  // All imagery is local (public/media, public/illustrations) or generated
  // client-side (gradient identicons) — no remote image hosts.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
