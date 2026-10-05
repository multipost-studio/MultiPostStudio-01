"use client";

import * as React from "react";
import { trackPromoCardAction } from "@/app/actions/promo-cards";

const SEEN_KEY = "mps-promo-seen";

/** Once per card per browser session (the server also dedupes per user). */
function markSeen(id: string): boolean {
  try {
    const seen = new Set<string>(JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? "[]"));
    if (seen.has(id)) return false;
    seen.add(id);
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage blocked — send it; the server dedupes */
  }
  return true;
}

/** Report an impression when `id` becomes the visible card. */
export function useImpression(id: string | undefined) {
  React.useEffect(() => {
    if (id && markSeen(id)) void trackPromoCardAction(id, "impression");
  }, [id]);
}

export const trackClick = (id: string) => void trackPromoCardAction(id, "click");
