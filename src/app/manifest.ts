import type { MetadataRoute } from "next";

// Next.js special file, auto-served at /manifest.webmanifest. Icons and name
// come from the existing MultiPost Studio brand assets, nothing invented.
// start_url is the dashboard: the useful landing spot for someone opening the
// installed app, not the marketing homepage.
//
// Colours match the app canvas (see --bg in globals.css), so the splash screen
// and window frame blend into the first paint instead of flashing black.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "MultiPost Studio",
    short_name: "MultiPost",
    description: "Plan, create, schedule, publish, engage and analyze social content in one workspace.",
    lang: "en",
    dir: "ltr",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    // Windows/desktop installs fall back to a minimal browser chrome rather than a plain tab.
    display_override: ["standalone", "minimal-ui"],
    background_color: "#060607",
    theme_color: "#060607",
    // No orientation lock: tablets, foldables and desktop windows must be free to rotate and resize.
    orientation: "any",
    categories: ["productivity", "business", "social"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the installed icon: the three things people open the app for.
    shortcuts: [
      { name: "New post", short_name: "New post", description: "Open the composer", url: "/composer/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Calendar", short_name: "Calendar", description: "See what is scheduled", url: "/calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Inbox", short_name: "Inbox", description: "Reply to comments and messages", url: "/inbox", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
