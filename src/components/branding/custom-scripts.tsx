"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { areaOf } from "@/lib/festivals/areas";
import { CONSENT_CHANGED, fetchConsentStatus } from "@/components/consent/consent-client";
import type { ScriptTag } from "@/lib/branding/tags";

/**
 * Adds the admin's custom scripts to the page. "Essential" scripts load at once;
 * "analytics" scripts wait for the same consent decision Google Analytics waits for
 * (an Accept where opt-in is required, never with Do Not Track or after Decline).
 * Scripts are only added on public pages (marketing and sign-in), never when a page
 * is opened inside the signed-in app or admin. Each script is added at most once per
 * page load, a script that fails to load cannot break the page, and nothing runs on
 * the server.
 */
export function CustomScripts({ scripts }: { scripts: ScriptTag[] }) {
  const added = React.useRef(new Set<string>());
  const isPublic = areaOf(usePathname() || "/") === "marketing";

  React.useEffect(() => {
    if (scripts.length === 0 || !isPublic) return;
    let alive = true;

    const add = (s: ScriptTag) => {
      if (added.current.has(s.id)) return;
      added.current.add(s.id);
      try {
        const el = document.createElement("script");
        el.dataset.mpsCustomTag = s.id;
        if (s.src) {
          el.src = s.src;
          el.async = true;
        } else {
          el.text = s.code;
        }
        (s.placement === "body" ? document.body : document.head).appendChild(el);
      } catch {
        /* a bad tag must never break the page */
      }
    };

    for (const s of scripts) if (s.consent === "essential") add(s);

    const analytics = scripts.filter((s) => s.consent === "analytics");
    if (analytics.length === 0) return;
    const run = (allowed: boolean) => {
      if (alive && allowed) analytics.forEach(add);
    };
    void fetchConsentStatus().then((s) => run(!!s?.analytics));
    const onChange = (e: Event) => run(!!(e as CustomEvent<{ analytics: boolean }>).detail?.analytics);
    window.addEventListener(CONSENT_CHANGED, onChange);
    return () => {
      alive = false;
      window.removeEventListener(CONSENT_CHANGED, onChange);
    };
  }, [scripts, isPublic]);

  return null;
}
