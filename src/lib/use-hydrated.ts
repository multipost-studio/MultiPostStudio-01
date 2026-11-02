"use client";

import * as React from "react";

const subscribe = () => () => {};

/**
 * False on the server and during the browser's first (hydrating) render, true afterwards.
 *
 * Use it around anything that depends on the visitor's own clock or time zone (today's date, a post's local time, "3 minutes
 * ago"). The server runs in UTC and the browser does not, so rendering those during hydration makes the two HTML versions
 * differ and React throws "Hydration failed". Render a placeholder while this is false, the real thing once it is true.
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(subscribe, () => true, () => false);
}
