"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Drives the queue in dev: pings /api/cron/tick on an interval so scheduled
 * posts publish and automations run while the app is open. Refreshes server
 * data when something was processed.
 *
 * In prod CRON_SECRET makes /api/cron/tick reject this unauthenticated poll with
 * 401 — the poller then stops itself and a real cron / the worker process takes
 * over.
 */
export function TickPoller({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    const run = async () => {
      if (stopped) return;
      try {
        const res = await fetch("/api/cron/tick", { method: "POST", cache: "no-store" });
        // 401 => CRON_SECRET is set (prod); a real cron/worker drives the queue.
        if (res.status === 401) {
          stopped = true;
          return;
        }
        const data = await res.json();
        if (!stopped && (data.processed > 0 || data.automations > 0)) {
          router.refresh();
        }
      } catch {
        // ignore transient errors
      }
    };
    run();
    const id = setInterval(run, intervalMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [intervalMs, router]);

  return null;
}
