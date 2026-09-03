"use client";

import * as React from "react";

/**
 * Warn before the user loses unsaved work. While `dirty` is true this arms the
 * browser's native beforeunload prompt (covers tab close, refresh, external
 * navigation). In-app route changes are guarded at the call site by checking
 * `dirty` before navigating.
 */
export function useUnsavedChanges(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
