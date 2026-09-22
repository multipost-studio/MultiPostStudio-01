"use client";

import * as React from "react";
import { loadPrefs, mascot } from "@/components/mascot/mascot-events";

/**
 * One-off companion cheer when the workspace lands on a posting-streak
 * milestone today. Rendered by `StreakCard` only when `reachedMilestone`
 * is set. Session-guarded per run+milestone so dashboard revisits don't
 * re-cheer; respects mute (non-critical) and the mascot cooldown.
 */
export function StreakCheer({ milestone, runId }: { milestone: number; runId: string }) {
  React.useEffect(() => {
    const key = `mps-streak-cheer:${runId}:${milestone}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Storage unavailable — stay silent rather than risk repeat cheers.
      return;
    }
    mascot.success(`${milestone}-day posting streak`, {
      body: loadPrefs().vibe === "hype"
        ? "Unstoppable. Keep the run going."
        : "Consistency compounds — keep the run going.",
      critical: false,
    });
  }, [milestone, runId]);
  return null;
}
