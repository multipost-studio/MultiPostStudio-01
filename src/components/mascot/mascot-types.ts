/** Shared types for the MultiPost Studio companion (mascot) system. */

export type MascotTone = "default" | "success" | "error" | "info" | "warning";

export interface MascotMessage {
  title: string;
  body?: string;
  tone?: MascotTone;
  actionLabel?: string;
  actionHref?: string;
  /**
   * When true, the bubble renders a "Show me around" button that starts the
   * onboarding tour (handled by MascotHost). Mutually exclusive with
   * actionHref — tour wins when both are set.
   */
  actionTour?: boolean;
  /**
   * Critical messages (important success / error feedback) bypass the
   * notification cooldown. Everything else is throttled so the mascot
   * feels intelligent rather than noisy.
   */
  critical?: boolean;
}

export type AssistantIcon = "create" | "calendar" | "connect" | "analytics" | "tour" | "help";

export interface AssistantAction {
  label: string;
  description: string;
  /** Internal route to navigate to. Mutually exclusive with `tour`. */
  href?: string;
  /** When true, selecting this action starts the onboarding tour. */
  tour?: boolean;
  icon: AssistantIcon;
}

export interface TourStep {
  title: string;
  body: string;
  /** Existing app route this step walks the user through. */
  route: string;
  routeLabel: string;
  /**
   * CSS selector of the real UI element to spotlight. When the element
   * cannot be found (permissions, layout), the card falls back to the
   * companion corner instead of breaking.
   */
  target?: string;
}

export interface MascotPrefs {
  /** Suppress non-critical mascot messages. */
  muted: boolean;
  /** Hide the companion entirely (a small restore control remains). */
  hidden: boolean;
  /** The "Show me around" tour has been completed at least once. */
  tourDone: boolean;
  /** Companion energy: calm (default) or hype (punchier copy). */
  vibe: "calm" | "hype";
}

/** One row of the assistant's "Getting started" checklist. */
export interface ChecklistItem {
  label: string;
  description: string;
  done: boolean;
  href: string;
}
