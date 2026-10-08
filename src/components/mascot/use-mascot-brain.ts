"use client";

import * as React from "react";
import { getMascotBriefingAction } from "@/app/actions/mascot";
import { attentionCount } from "@/lib/mascot-brain/insights";
import type { Insight } from "@/lib/mascot-brain/types";
import { EMPTY_MEMORY, loadMemory, rememberQuestion, saveMemory, snooze, visibleInsights, type BrainMemory } from "./brain-memory";

const POLL_MS = 5 * 60_000;
/** A refresh requested sooner than this after the last one is skipped, so busy pages do not hammer the server. */
const MIN_GAP_MS = 8_000;
const FIRST_LOAD_DELAY_MS = 2_500;

/**
 * Keeps the companion's picture of the workspace fresh: loads the briefing
 * shortly after the app opens, refreshes every five minutes while the tab is
 * visible (and when it regains focus), and remembers what you snoozed or asked.
 * A failed fetch simply leaves the last good briefing in place.
 */
export function useMascotBrain({ enabled }: { enabled: boolean }) {
  const [all, setAll] = React.useState<Insight[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [memory, setMemory] = React.useState<BrainMemory>(EMPTY_MEMORY);
  const lastFetch = React.useRef(0);
  const inflight = React.useRef(false);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    setMemory(loadMemory());
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = React.useCallback(async (force = false) => {
    if (!enabled || inflight.current) return;
    if (!force && Date.now() - lastFetch.current < MIN_GAP_MS) return;
    inflight.current = true;
    lastFetch.current = Date.now();
    try {
      const res = await getMascotBriefingAction();
      if (alive.current && res.ok) {
        setAll(res.insights);
        setLoaded(true);
      } else if (alive.current) {
        setLoaded(true); // show the calm state rather than a skeleton forever
      }
    } catch {
      if (alive.current) setLoaded(true);
    } finally {
      inflight.current = false;
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return;
    const first = window.setTimeout(() => void refresh(true), FIRST_LOAD_DELAY_MS);
    const poll = window.setInterval(() => {
      if (!document.hidden) void refresh(true);
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastFetch.current > 2 * 60_000) void refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  const visible = React.useMemo(() => visibleInsights(all, memory), [all, memory]);

  const snoozeInsight = React.useCallback((insight: Pick<Insight, "id" | "severity">) => {
    setMemory((m) => {
      const next = snooze(m, insight);
      saveMemory(next);
      return next;
    });
  }, []);

  const rememberAsked = React.useCallback((q: string) => {
    setMemory((m) => {
      const next = rememberQuestion(m, q);
      saveMemory(next);
      return next;
    });
  }, []);

  // Stable identity: consumers put this in effect dependency lists.
  return React.useMemo(
    () => ({ all, insights: visible, loaded, memory, attention: attentionCount(visible), snoozeInsight, rememberAsked, refresh }),
    [all, visible, loaded, memory, snoozeInsight, rememberAsked, refresh],
  );
}
