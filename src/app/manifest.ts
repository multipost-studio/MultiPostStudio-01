import type { MetadataRoute } from "next";

// Next.js special file — auto-served at /manifest.webmanifest. Icons and name
// come from the existing MultiPost Studio brand assets (public/media/Favicon.png),
// nothing invented. start_url is the dashboard: the useful landing spot for
// someone opening the installed app, not the marketing homepage.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MultiPost Studio",
    short_name: "MultiPost",
    description: "Plan, create, schedule, publish, engage and analyze social content in one workspace.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#14101f",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
