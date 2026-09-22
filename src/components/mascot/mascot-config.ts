import type { AssistantAction, ChecklistItem, MascotMessage, MascotPrefs, TourStep } from "./mascot-types";

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

/**
 * Quiet hours (local time): casual nudges stay silent between midnight and
 * 6am. Critical success/error feedback always passes through.
 */
export const QUIET_HOURS = { from: 0, to: 6 } as const;

/** Pure — true when `hour` falls inside quiet hours. */
export function inQuietHours(hour: number): boolean {
  return hour >= QUIET_HOURS.from && hour < QUIET_HOURS.to;
}

/**
 * First-run window: accounts younger than this get the guided welcome
 * (pure — pass timestamps explicitly in tests).
 */
export const FIRST_RUN_WINDOW_MS = 7 * 86_400_000;

export function isFreshAccount(args: { createdAtMs: number; nowMs: number }): boolean {
  return args.nowMs - args.createdAtMs < FIRST_RUN_WINDOW_MS;
}

/** Welcome message for brand-new users — carries a one-tap tour action. */
export function firstRunWelcome(name?: string): MascotMessage {
  const first = name?.split(" ")[0];
  return {
    title: first ? `Welcome aboard, ${first}` : "Welcome to MultiPost Studio",
    body: "New here? I'll show you around in under two minutes.",
    tone: "default",
    actionTour: true,
  };
}

/** Gentle tour nudge for existing users who never took the tour. */
export function tourInvite(): MascotMessage {
  return {
    title: "Psst — want the grand tour?",
    body: "Six stops, two minutes — dashboard to integrations.",
    tone: "default",
    actionTour: true,
  };
}

/** One-shot rescue prompt when today's streak is about to break. */
export function streakSaver(current: number): MascotMessage {
  return {
    title: `Your ${current}-day streak ends tonight`,
    body: "Schedule or publish one post to keep the run alive.",
    tone: "warning",
    actionLabel: "Schedule a post",
    actionHref: "/composer/new",
  };
}

/** Work nudges — real pending work, each with a direct action. All hrefs are REAL existing routes. */
export function approvalsNudge(count: number): MascotMessage {
  return {
    title: count === 1 ? "1 post is awaiting your review" : `${count} posts are awaiting your review`,
    body: "Your team is waiting on a decision.",
    tone: "warning",
    actionLabel: "Review now",
    actionHref: "/approvals",
  };
}

export function inboxNudge(count: number): MascotMessage {
  return {
    title: count === 1 ? "1 conversation needs a reply" : `${count} conversations need replies`,
    body: "Fast responses boost every platform's ranking.",
    tone: "default",
    actionLabel: "Open inbox",
    actionHref: "/inbox",
  };
}

export function milestoneTeaser(next: number, inDays: number): MascotMessage {
  return {
    title: inDays === 1 ? `1 day to your ${next}-day milestone` : `${inDays} days to your ${next}-day milestone`,
    body: "Publish daily to hit it — the companion will cheer.",
    tone: "default",
    actionLabel: "View streak",
    actionHref: "/insights/streak",
  };
}
/** How long a mascot message stays visible before returning to idle (ms). */
export const MASCOT_DISMISS_MS = 4500;

export const MASCOT_PREFS_KEY = "mps-mascot-prefs";

export const DEFAULT_PREFS: MascotPrefs = { muted: false, hidden: false, tourDone: false, vibe: "calm" };

/** Time-of-day greeting (pure — pass the hour explicitly in tests). */
export function greetingForHour(h: number): string {
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Day-of-year seed so rotating copy changes once per day (pure). */
export function daySeedForDate(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

/** Route-aware contextual hints. Matched by longest path prefix. */
type RouteEntry = {
  prefix: string;
  message: MascotMessage;
  /** Uses the dashboard greeting (time-aware title) instead of a fixed title. */
  greeting?: boolean;
  /** Rotating body lines — picked deterministically by day so repeat visits feel fresh. */
  bodies?: string[];
  /** Punchier pool used when the companion vibe is "hype". */
  hypeBodies?: string[];
};
const ROUTE_MESSAGES: RouteEntry[] = [
  {
    prefix: "/dashboard",
    message: { title: "Welcome back", body: "Ready to plan some content?", tone: "default" },
    greeting: true,
  },
  {
    prefix: "/composer/new",
    message: { title: "Blank canvas, full power", body: "Draft it here — AI Assist can tighten the hook.", tone: "default" },
  },
  {
    prefix: "/composer/grid",
    message: { title: "Looking sharp", body: "This is exactly how your profile grid will land.", tone: "default" },
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
    message: {
      title: "Your queue keeps publishing on schedule",
      tone: "default",
      actionLabel: "Open calendar",
      actionHref: "/calendar",
    },
  },
  {
    prefix: "/analytics",
    message: {
      title: "Once you publish content, performance data appears here",
      tone: "info",
      actionLabel: "Build a report",
      actionHref: "/reports/builder",
    },
  },
  {
    prefix: "/media",
    message: { title: "Your content library lives here", tone: "default" },
  },
  {
    prefix: "/campaigns",
    message: {
      title: "Ready to create your first campaign?",
      tone: "default",
      actionLabel: "Create a campaign",
      actionHref: "/campaigns?new=1",
    },
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
    bodies: [
      "Looking good — keep the ideas coming",
      "Today's stray thought is next week's best post",
      "Bank three ideas now, thank yourself on Friday",
    ],
    hypeBodies: [
      "Idea machine: ACTIVATED. Keep them coming",
      "That stray thought? Next week's breakout post",
      "Bank three bangers now, thank yourself Friday",
    ],
  },
  {
    prefix: "/studio",
    message: { title: "Looking good — keep creating", tone: "default" },
    bodies: [
      "Looking good — keep creating",
      "Small steps daily beat weekend marathons",
      "Your future self is already grateful",
    ],
    hypeBodies: [
      "Stunning work — keep shipping",
      "Daily reps beat weekend marathons. Go again",
      "Your future self is already celebrating",
    ],
  },
  {
    prefix: "/inbox",
    message: { title: "Every conversation, one place", tone: "default" },
  },
  {
    prefix: "/approvals",
    message: { title: "Nothing slips through", body: "Review, request changes, or clear posts for takeoff.", tone: "default" },
  },
  {
    prefix: "/reports",
    message: { title: "Proof of progress", body: "Build a share-ready report from live performance data.", tone: "default" },
  },
  {
    prefix: "/team",
    message: { title: "Many hands, one brand", body: "Invite teammates and set who can approve what.", tone: "default" },
  },
  {
    prefix: "/settings",
    message: { title: "Tune the engine room", body: "Brand voice, billing, workspaces — it's all in here.", tone: "default" },
  },
];

/**
 * Pure helper — returns the contextual message for a pathname, if any.
 * Longest prefix wins. Optional `at` (default: now) drives the time-aware
 * dashboard greeting and the daily-rotating variant bodies deterministically.
 * Optional `vibe` swaps calm pools for punchier hype pools.
 */
export function matchRouteMessage(
  pathname: string,
  at: Date = new Date(),
  vibe: "calm" | "hype" = "calm",
): MascotMessage | null {
  let best: RouteEntry | null = null;
  for (const entry of ROUTE_MESSAGES) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  if (!best) return null;
  const message = { ...best.message };
  if (best.greeting) {
    // Monday gets its own momentum line; other days get the time greeting.
    message.title = at.getDay() === 1 ? "Monday — fresh week, fresh reach" : greetingForHour(at.getHours());
  }
  const pool = vibe === "hype" && best.hypeBodies?.length ? best.hypeBodies : best.bodies;
  if (pool && pool.length > 0) {
    message.title = pool[daySeedForDate(at) % pool.length];
  }
  return message;
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

/**
 * Contextual lead action for the assistant panel ("Suggested for this
 * page"). Pure — longest prefix wins, null means "no suggestion, show the
 * standard list". Every href is a REAL existing route.
 */
const CONTEXT_ACTIONS: { prefix: string; action: AssistantAction }[] = [
  {
    prefix: "/composer",
    action: { label: "Schedule content", description: "Open the calendar", href: "/calendar", icon: "calendar" },
  },
  {
    prefix: "/ideas",
    action: { label: "Create a post", description: "Open the composer", href: "/composer/new", icon: "create" },
  },
  {
    prefix: "/calendar",
    action: { label: "Create a post", description: "Open the composer", href: "/composer/new", icon: "create" },
  },
  {
    prefix: "/queue",
    action: { label: "Create a post", description: "Open the composer", href: "/composer/new", icon: "create" },
  },
  {
    prefix: "/analytics",
    action: { label: "Build a report", description: "Share-ready performance PDF", href: "/reports/builder", icon: "analytics" },
  },
  {
    prefix: "/reports",
    action: { label: "View analytics", description: "See performance", href: "/analytics", icon: "analytics" },
  },
  {
    prefix: "/media",
    action: { label: "Create a post", description: "Use these assets", href: "/composer/new", icon: "create" },
  },
  {
    prefix: "/integrations",
    action: { label: "Schedule content", description: "Open the calendar", href: "/calendar", icon: "calendar" },
  },
  {
    prefix: "/inbox",
    action: { label: "Create a post", description: "Turn replies into content", href: "/composer/new", icon: "create" },
  },
];

export function contextActionFor(pathname: string): AssistantAction | null {
  let best: { prefix: string; action: AssistantAction } | null = null;
  for (const entry of CONTEXT_ACTIONS) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  return best ? { ...best.action } : null;
}

/**
 * "Getting started" checklist (pure). Done-flags come from the server shell;
 * labels and hrefs are fixed to REAL existing routes.
 */
export function buildChecklist(state: {
  connected: boolean;
  created: boolean;
  scheduled: boolean;
}): ChecklistItem[] {
  return [
    {
      label: "Connect an account",
      description: "Link your first platform",
      done: state.connected,
      href: "/integrations",
    },
    {
      label: "Create your first post",
      description: "Draft it in the composer",
      done: state.created,
      href: "/composer/new",
    },
    {
      label: "Schedule it",
      description: "Pick a best-time slot",
      done: state.scheduled,
      href: "/calendar",
    },
  ];
}
