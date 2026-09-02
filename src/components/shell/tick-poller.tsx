"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Drives the stub queue: pings /api/cron/tick on an interval so scheduled posts
 * publish and automations run while the app is open. Refreshes server data when
 * something was processed.
 */
export function TickPoller({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    const run = async () => {
      try {
        const res = await fetch("/api/cron/tick", { method: "POST", cache: "no-store" });
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
