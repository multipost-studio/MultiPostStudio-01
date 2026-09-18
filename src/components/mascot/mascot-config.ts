import type { AssistantAction, MascotMessage, MascotPrefs, TourStep } from "./mascot-types";

/**
 * Central configuration for the MultiPost Studio companion.
 *
 * Assets are the official MIT-licensed "glasses" sprite sheets from
 * `page-mascot` (https://github.com/nilbuild/page-mascot), served locally
 * from `public/mascots` so the companion works offline and adds no
 * third-party requests.
 */
export const MASCOT_DIRECTIONS = "/mascots/glasses-directions.webp";
export const MASCOT_REACTIONS = "/mascots/glasses-reactions.webp";

/** Accessible name for the companion (page-mascot renders "Boop the …"). */
export const MASCOT_LABEL = "MultiPost Studio companion";

/** Minimum interval between non-critical mascot messages (ms). */
export const MASCOT_COOLDOWN_MS = 20_000;

/** How long a mascot message stays visible before returning to idle (ms). */
export const MASCOT_DISMISS_MS = 4500;

export const MASCOT_PREFS_KEY = "mps-mascot-prefs";

export const DEFAULT_PREFS: MascotPrefs = { muted: false, hidden: false, tourDone: false };

/** Route-aware contextual hints. Matched by longest path prefix. */
const ROUTE_MESSAGES: { prefix: string; message: MascotMessage }[] = [
  {
    prefix: "/dashboard",
    message: { title: "Welcome back", body: "Ready to plan some content?", tone: "default" },
  },
  {
    prefix: "/composer",
    message: { title: "Let's create something great", tone: "default" },
  },
  {
    prefix: "/calendar",
    message: { title: "Your content plan is taking shape", tone: "default" },
  },
  {
    prefix: "/queue",
    message: { title: "Your queue keeps publishing on schedule", tone: "default" },
  },
  {
    prefix: "/analytics",
    message: {
      title: "Once you publish content, performance data appears here",
      tone: "info",
    },
  },
  {
    prefix: "/media",
    message: { title: "Your content library lives here", tone: "default" },
  },
  {
    prefix: "/campaigns",
    message: { title: "Ready to create your first campaign?", tone: "default" },
  },
  {
    prefix: "/automations",
    message: { title: "Automations run while you sleep", tone: "default" },
  },
  {
    prefix: "/integrations",
    message: { title: "Connect the platforms you want to publish to", tone: "info" },
  },
  {
    prefix: "/ideas",
    message: { title: "Looking good — keep the ideas coming", tone: "default" },
  },
  {
    prefix: "/studio",
    message: { title: "Looking good — keep creating", tone: "default" },
  },
  {
    prefix: "/inbox",
    message: { title: "Every conversation, one place", tone: "default" },
  },
];

/** Pure helper — returns the contextual message for a pathname, if any. */
export function matchRouteMessage(pathname: string): MascotMessage | null {
  let best: { prefix: string; message: MascotMessage } | null = null;
  for (const entry of ROUTE_MESSAGES) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  return best ? { ...best.message } : null;
}

export interface TourCardPlacement {
  top: number;
  left: number;
}

/**
 * Pure tour-card placement (unit-tested). Prefers below the spotlighted
 * element, falls back above it, then pins above the floating companion
 * corner. Never returns an off-viewport position.
 */
export function placeTourCard(
  viewport: { w: number; h: number },
  target: { x: number; y: number; width: number; height: number } | null,
  card: { w: number; h: number },
): TourCardPlacement {
  const margin = 12;
  const maxLeft = Math.max(margin, viewport.w - card.w - margin);
  if (!target) {
    return {
      // Above the floating companion (96px mascot + gap + safe margin).
      top: Math.max(margin, viewport.h - card.h - 132),
      left: maxLeft,
    };
  }
  const left = Math.min(Math.max(margin, target.x), maxLeft);
  const below = target.y + target.height + margin;
  if (below + card.h <= viewport.h - 8) return { top: below, left };
  const above = target.y - margin - card.h;
  if (above >= 8) return { top: above, left };
  return { top: Math.max(margin, viewport.h - card.h - 132), left };
}

export const ASSISTANT_ACTIONS: AssistantAction[] = [
  {
    label: "Create a post",
    description: "Open the composer",
    href: "/composer/new",
    icon: "create",
  },
  {
    label: "Schedule content",
    description: "Open the calendar",
    href: "/calendar",
    icon: "calendar",
  },
  {
    label: "Connect social account",
    description: "Manage integrations",
    href: "/integrations",
    icon: "connect",
  },
  {
    label: "View analytics",
    description: "See performance",
    href: "/analytics",
    icon: "analytics",
  },
  {
    label: "Show me around",
    description: "Take the quick tour",
    tour: true,
    icon: "tour",
  },
  {
    label: "Help & guides",
    description: "Open the help center",
    href: "/help",
    icon: "help",
  },
];

/** Interactive walkthrough. Every step navigates to a REAL existing route. */
export const TOUR_STEPS: TourStep[] = [
  {
    title: "Your command center",
    body: "This is your dashboard — priorities, performance and AI recommendations at a glance.",
    route: "/dashboard",
    routeLabel: "Dashboard",
    target: '[data-tour="dashboard"]',
  },
  {
    title: "Create and manage posts",
    body: "Compose, refine with AI and publish your social posts from here.",
    route: "/composer/new",
    routeLabel: "Composer",
    target: '[data-tour="composer"]',
  },
  {
    title: "Plan and schedule",
    body: "Drag, drop and schedule your content across every channel.",
    route: "/calendar",
    routeLabel: "Calendar",
    target: '[data-tour="calendar"]',
  },
  {
    title: "Track performance",
    body: "See how your content performs once you start publishing.",
    route: "/analytics",
    routeLabel: "Analytics",
    target: '[data-tour="analytics"]',
  },
  {
    title: "Connect your platforms",
    body: "Link the social accounts you want to publish to.",
    route: "/integrations",
    routeLabel: "Integrations",
    target: '[data-tour="integrations"]',
  },
  {
    title: "You're all set",
    body: "That's the tour — I'll stay here quietly if you need anything.",
    route: "/dashboard",
    routeLabel: "Dashboard",
  },
];
