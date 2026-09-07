"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Once the server answers 401 the queue is driven by a real cron/worker, so no
 * instance of this component should poll again for the life of the page.
 *
 * This lives at module scope on purpose. It used to be a local `stopped` flag,
 * which was recreated on every effect run — and because `router` sat in the
 * dependency array, the effect tore down and re-ran on render churn, firing an
 * immediate request each time. The result was a burst of ~10 failing POSTs per
 * second to /api/cron/tick from every signed-in browser.
 */
let pollingDisabled = false;

/**
 * Drives the queue in dev: pings /api/cron/tick on an interval so scheduled
 * posts publish and automations run while the app is open. Refreshes server
 * data when something was processed.
 *
 * In prod CRON_SECRET makes /api/cron/tick reject this unauthenticated poll
 * with 401 — the poller then stops permanently and a real cron / the worker
 * process takes over.
 */
export function TickPoller({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  // Kept in a ref so `router` doesn't need to be an effect dependency.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (pollingDisabled) return;

    let cancelled = false;

    const run = async () => {
      if (cancelled || pollingDisabled) return;
      try {
        const res = await fetch("/api/cron/tick", { method: "POST", cache: "no-store" });
        // 401 => CRON_SECRET is set; a real cron/worker drives the queue.
        if (res.status === 401) {
          pollingDisabled = true;
          clearInterval(timer);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && (data.processed > 0 || data.automations > 0)) {
          routerRef.current.refresh();
        }
      } catch {
        // Transient network errors are ignored; the next tick retries.
      }
    };

    // Interval is created before the first run so an immediate 401 can clear it.
    const timer = setInterval(run, intervalMs);
    void run();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return null;
}
