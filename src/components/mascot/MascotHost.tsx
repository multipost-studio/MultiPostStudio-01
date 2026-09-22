"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { Sparkles } from "lucide-react";
import { MascotBubble } from "./MascotBubble";
import { MascotAssistant } from "./MascotAssistant";
import { TourSpotlight } from "./TourSpotlight";
import { MultiPostMascot } from "./MultiPostMascot";
import {
  MASCOT_DISMISS_MS,
  TOUR_STEPS,
  approvalsNudge,
  buildChecklist,
  contextActionFor,
  firstRunWelcome,
  inQuietHours,
  inboxNudge,
  matchRouteMessage,
  milestoneTeaser,
  streakSaver,
  tourInvite,
} from "./mascot-config";
import {
  MASCOT_EVENT,
  TOAST_EVENT,
  loadPrefs,
  passesCooldown,
  savePrefs,
  type MascotEventDetail,
  type ToastEventDetail,
} from "./mascot-events";
import type { MascotMessage, MascotPrefs } from "./mascot-types";

/**
 * Orchestrator for the MultiPost Studio companion ("MascotController" role).
 *
 * Mounted once per shell — inside the authenticated `AppShell` (full
 * behavior) and inside the marketing layout (subtle: quiet companion +
 * assistant only, never auto-messages). Auth pages never mount it.
 *
 * Message sources, in priority order:
 *  1. `mps:toast` bridge — real app feedback (post saved/scheduled/
 *     published/failed, account connected…) via the existing toast system.
 *     Success/error bypass the cooldown; everything else is ignored.
 *  2. Imperative `mascot.*` events for future call sites.
 *  3. First-run welcome — brand-new accounts (firstRun) landing on the
 *     dashboard get a guided welcome with a one-tap tour start, once per
 *     session, unless they've already toured. Beats the generic hint.
 *  4. Route-aware contextual hints — once per section per session.
 */
export function MascotHost({
  variant = "full",
  firstRun = false,
  userName,
  progress,
  streakSaverDays,
  workNudges,
}: {
  variant?: "full" | "subtle";
  /** True when the account is brand-new — triggers the guided welcome. */
  firstRun?: boolean;
  /** Full display name; only the first word is ever shown. */
  userName?: string;
  /** Getting-started progress for the assistant checklist. Null hides it. */
  progress?: { connected: boolean; created: boolean; scheduled: boolean } | null;
  /**
   * Streak rescue: current run length when the streak is at_risk with
   * nothing scheduled today. Null disables the saver nudge.
   */
  streakSaverDays?: number | null;
  /**
   * Real pending work for dashboard nudges (first match wins, once per
   * session): approvals awaiting review, open inbox conversations, and a
   * near milestone ({ next, inDays } — shown when inDays <= 2).
   */
  workNudges?: {
    approvals: number;
    inbox: number;
    milestone: { next: number; inDays: number } | null;
  } | null;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  const [mounted, setMounted] = React.useState(false);
  const [prefs, setPrefs] = React.useState<MascotPrefs>({ muted: false, hidden: false, tourDone: false, vibe: "calm" });
  const [message, setMessage] = React.useState<MascotMessage | null>(null);
  const [assistantOpen, setAssistantOpen] = React.useState(false);
  const [tourIndex, setTourIndex] = React.useState<number | null>(null);
  const [pulse, setPulse] = React.useState<{ kind: "joy" | "oops"; at: number } | null>(null);

  const lastShownAt = React.useRef(0);
  const seenSections = React.useRef(new Set<string>());
  const welcomed = React.useRef(false);
  const dismissTimer = React.useRef<number | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const clearDismissTimer = React.useCallback(() => {
    if (dismissTimer.current !== null) {
      window.clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  React.useEffect(() => () => {
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
  }, []);

  const showMessage = React.useCallback(
    (msg: MascotMessage) => {
      if (prefs.hidden) return;
      if (prefs.muted && !msg.critical) return;
      // Quiet hours: casual nudges wait for morning; critical feedback
      // (success/error) always passes through.
      if (!msg.critical && inQuietHours(new Date().getHours())) return;
      const now = Date.now();
      if (!passesCooldown({ critical: msg.critical, lastShownAt: lastShownAt.current, now })) return;
      lastShownAt.current = now;
      clearDismissTimer();
      setMessage(msg);
      dismissTimer.current = window.setTimeout(() => setMessage(null), MASCOT_DISMISS_MS);
    },
    [prefs.hidden, prefs.muted, clearDismissTimer],
  );

  const hideMessage = React.useCallback(() => {
    clearDismissTimer();
    setMessage(null);
  }, [clearDismissTimer]);

  // Mount gate: avoids hydration mismatch (localStorage prefs, matchMedia
  // sizing) and keeps the companion out of the SSR HTML entirely.
  React.useEffect(() => {
    setMounted(true);
    setPrefs(loadPrefs());
  }, []);

  // Imperative `mascot.*` events.
  React.useEffect(() => {
    if (variant !== "full") return;
    const onMascot = (e: Event) => {
      const detail = (e as CustomEvent<MascotEventDetail>).detail;
      if (!detail) return;
      if (detail.hide) hideMessage();
      else if (detail.message) showMessage(detail.message);
    };
    window.addEventListener(MASCOT_EVENT, onMascot);
    return () => window.removeEventListener(MASCOT_EVENT, onMascot);
  }, [variant, showMessage, hideMessage]);

  // Toast bridge — the real-event integration. Only success/error tones
  // surface as companion feedback, reusing the toast's own copy. The avatar
  // also pulses joy/oops so the reaction reads even with bubbles muted.
  React.useEffect(() => {
    if (variant !== "full") return;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastEventDetail>).detail;
      if (!detail) return;
      if (detail.tone === "success") {
        setPulse({ kind: "joy", at: Date.now() });
        showMessage({ title: detail.title, tone: "success", critical: true });
      } else if (detail.tone === "error") {
        setPulse({ kind: "oops", at: Date.now() });
        showMessage({ title: detail.title, tone: "error", critical: true });
      }
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, [variant, showMessage]);

  // First-run welcome + tour nudge — brand-new accounts landing on the
  // dashboard get a guided greeting; existing users who never toured get a
  // gentle invite instead. One-tap tour start, once per session, never
  // during the tour, never when muted/hidden (showMessage gates those).
  React.useEffect(() => {
    if (variant !== "full" || !mounted) return;
    if (tourIndex !== null || assistantOpen || welcomed.current) return;
    if (pathname !== "/dashboard" || prefs.tourDone) return;
    welcomed.current = true;
    showMessage(firstRun ? firstRunWelcome(userName) : tourInvite());
  }, [variant, mounted, firstRun, pathname, tourIndex, assistantOpen, prefs.tourDone, userName, showMessage]);

  // Streak saver — the run breaks tonight and nothing is scheduled.
  // One shot per session, after the welcome/invite, before the hint.
  React.useEffect(() => {
    if (variant !== "full" || !mounted) return;
    if (tourIndex !== null || assistantOpen || welcomed.current) return;
    if (pathname !== "/dashboard" || streakSaverDays == null) return;
    welcomed.current = true;
    showMessage(streakSaver(streakSaverDays));
  }, [variant, mounted, pathname, tourIndex, assistantOpen, streakSaverDays, showMessage]);

  // Work nudges — real pending work on the dashboard, first match wins.
  // Ordered after the welcome/invite and the streak saver, before the
  // generic hint. One shot per session via the shared welcomed guard.
  React.useEffect(() => {
    if (variant !== "full" || !mounted) return;
    if (tourIndex !== null || assistantOpen || welcomed.current) return;
    if (pathname !== "/dashboard" || !workNudges) return;
    const next =
      workNudges.approvals > 0
        ? approvalsNudge(workNudges.approvals)
        : workNudges.inbox > 0
          ? inboxNudge(workNudges.inbox)
          : workNudges.milestone && workNudges.milestone.inDays <= 2
            ? milestoneTeaser(workNudges.milestone.next, workNudges.milestone.inDays)
            : null;
    if (!next) return;
    welcomed.current = true;
    showMessage(next);
  }, [variant, mounted, pathname, tourIndex, assistantOpen, workNudges, showMessage]);

  // Route-aware contextual hints — silent by default, one hint per section
  // per session, never during the tour or while the assistant is open.
  // Skipped on the dashboard when the first-run welcome already greeted
  // this session (no double-tap).
  React.useEffect(() => {
    if (variant !== "full" || !mounted) return;
    if (tourIndex !== null || assistantOpen) return;
    if (welcomed.current && pathname === "/dashboard") return;
    const contextual = matchRouteMessage(pathname, new Date(), prefs.vibe);
    if (!contextual) return;
    if (seenSections.current.has(contextual.title)) return;
    seenSections.current.add(contextual.title);
    showMessage(contextual);
  }, [variant, mounted, pathname, tourIndex, assistantOpen, prefs.vibe, showMessage]);

  const returnFocus = React.useCallback(() => {
    rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  const updatePrefs = React.useCallback((next: MascotPrefs) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  const openAssistant = React.useCallback(() => {
    hideMessage();
    setAssistantOpen(true);
  }, [hideMessage]);

  const startTour = React.useCallback(() => {
    setAssistantOpen(false);
    hideMessage();
    setTourIndex(0);
    router.push(TOUR_STEPS[0].route);
  }, [hideMessage, router]);

  const nextTourStep = React.useCallback(() => {
    if (tourIndex === null) return;
    if (tourIndex >= TOUR_STEPS.length - 1) {
      setTourIndex(null);
      updatePrefs({ ...prefs, tourDone: true });
      showMessage({ title: "You're all set!", tone: "success", critical: true });
      return;
    }
    const next = tourIndex + 1;
    setTourIndex(next);
    router.push(TOUR_STEPS[next].route);
  }, [tourIndex, prefs, router, showMessage, updatePrefs]);

  const prevTourStep = React.useCallback(() => {
    if (tourIndex === null || tourIndex === 0) return;
    const prev = tourIndex - 1;
    setTourIndex(prev);
    router.push(TOUR_STEPS[prev].route);
  }, [tourIndex, router]);

  if (!mounted) return null;

  if (prefs.hidden) {
    return (
      <div className="pointer-events-none fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-3 z-[var(--z-mascot)] sm:right-5">
        <button
          type="button"
          onClick={() => updatePrefs({ ...prefs, hidden: false })}
          aria-label="Show MultiPost companion"
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-muted)] shadow-lg hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <Sparkles size={15} aria-hidden />
        </button>
      </div>
    );
  }

  const panel = assistantOpen ? (
    <MascotAssistant
      key="assistant"
      onClose={() => setAssistantOpen(false)}
      onStartTour={startTour}
      returnFocus={returnFocus}
      muted={prefs.muted}
      contextAction={contextActionFor(pathname)}
      checklist={progress ? buildChecklist(progress) : null}
      vibe={prefs.vibe}
      onToggleVibe={() => updatePrefs({ ...prefs, vibe: prefs.vibe === "hype" ? "calm" : "hype" })}
      onToggleMute={() => updatePrefs({ ...prefs, muted: !prefs.muted })}
      onHide={() => {
        setAssistantOpen(false);
        updatePrefs({ ...prefs, hidden: true });
      }}
    />
  ) : tourIndex !== null ? (
    <TourSpotlight
      key={`tour-${tourIndex}`}
      step={tourIndex}
      onNext={nextTourStep}
      onBack={prevTourStep}
      onSkip={() => setTourIndex(null)}
    />
  ) : message ? (
    <MascotBubble key="bubble" message={message} onClose={hideMessage} onTourAction={startTour} />
  ) : null;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-3 z-[var(--z-mascot)] flex flex-col items-end gap-2.5 sm:right-5"
    >
      <AnimatePresence mode="wait" initial={false}>
        {panel}
      </AnimatePresence>
      <MultiPostMascot pulse={pulse} onActivate={() => (assistantOpen ? setAssistantOpen(false) : openAssistant())} />
    </div>
  );
}
