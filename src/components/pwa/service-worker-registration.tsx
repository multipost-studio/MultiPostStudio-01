"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";

/**
 * Registers /sw.js (see that file for what it does and doesn't cache) and
 * surfaces a toast when a new version has installed and is waiting to take
 * over, instead of leaving a tab silently stuck on stale build assets after
 * a deploy — the update-strategy requirement this was built for.
 */
export function ServiceWorkerRegistration() {
  const { toast } = useToast();

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | undefined;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        reg = registration;
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              toast({
                title: "Update available",
                description: "A new version is ready. Refresh to use it.",
                tone: "info",
              });
            }
          });
        });
      })
      .catch(() => {
        // Registration failure (unsupported browser, blocked, etc.) is never
        // fatal to the app — it only means no offline asset cache / install
        // prompt this session.
      });

    return () => {
      // Nothing to tear down: the registration itself outlives this
      // component's mount (it's a browser-level registration, not app state).
      void reg;
    };
  }, [toast]);

  return null;
}
