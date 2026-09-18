/**
 * Client-side event system for the MultiPost Studio companion.
 *
 * Deliberately tiny and dependency-free:
 * - transport is `window.CustomEvent` (no store, no Supabase, no network)
 * - all strings are controlled app copy (no unsafe HTML, no injection)
 * - cooldown + prefs keep the mascot quiet unless something matters
 */

import type { MascotMessage, MascotPrefs } from "./mascot-types";
import { DEFAULT_PREFS, MASCOT_COOLDOWN_MS, MASCOT_PREFS_KEY } from "./mascot-config";

/** Dispatched to show / hide a companion message. */
export const MASCOT_EVENT = "mps:mascot";

/**
 * Dispatched by `ToastProvider` for every toast. The companion listens and
 * only reacts to `success` / `error` tones — this is how real app events
 * (post saved, scheduled, published, publish failed, account connected…)
 * reach the mascot without touching any server action or API route.
 */
export const TOAST_EVENT = "mps:toast";

export interface MascotEventDetail {
  message?: MascotMessage;
  hide?: boolean;
}

export interface ToastEventDetail {
  title: string;
  tone: string;
}

function dispatch(detail: MascotEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MascotEventDetail>(MASCOT_EVENT, { detail }));
}

/** Minimal imperative API — the cleanest fit for this codebase (no store). */
export const mascot = {
  show(title: string, opts?: Partial<MascotMessage>) {
    dispatch({ message: { title, tone: "default", ...opts } });
  },
  success(title: string, opts?: Partial<MascotMessage>) {
    dispatch({ message: { title, tone: "success", critical: true, ...opts } });
  },
  error(title: string, opts?: Partial<MascotMessage>) {
    dispatch({ message: { title, tone: "error", critical: true, ...opts } });
  },
  info(title: string, opts?: Partial<MascotMessage>) {
    dispatch({ message: { title, tone: "info", ...opts } });
  },
  hideMessage() {
    dispatch({ hide: true });
  },
};

/**
 * Pure cooldown gate (unit-tested). Critical success/error feedback always
 * passes; ordinary hints are throttled to one per `cooldownMs`.
 */
export function passesCooldown(args: {
  critical?: boolean;
  lastShownAt: number;
  now: number;
  cooldownMs?: number;
}): boolean {
  const { critical, lastShownAt, now, cooldownMs = MASCOT_COOLDOWN_MS } = args;
  if (critical) return true;
  if (lastShownAt <= 0) return true;
  return now - lastShownAt >= cooldownMs;
}

/** Pure prefs merge — unknown shapes fall back to defaults (unit-tested). */
export function mergePrefs(stored: unknown): MascotPrefs {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...DEFAULT_PREFS };
  const s = stored as Record<string, unknown>;
  return {
    muted: s.muted === true,
    hidden: s.hidden === true,
    tourDone: s.tourDone === true,
  };
}

export function loadPrefs(): MascotPrefs {
  try {
    const raw = window.localStorage.getItem(MASCOT_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return mergePrefs(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: MascotPrefs): void {
  try {
    window.localStorage.setItem(MASCOT_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private mode, quota) — prefs simply don't persist.
  }
}
