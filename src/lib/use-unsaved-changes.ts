"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Warn before the user loses unsaved work.
 *
 * While `dirty` is true this:
 *  - arms the native beforeunload prompt (tab close, refresh, hard nav), and
 *  - intercepts in-app link clicks in the capture phase, so clicking the
 *    sidebar, the logo, or any other `<a>` while a draft is unsaved asks first.
 *
 * The click guard fails open: if `confirm` isn't available (some embedded
 * contexts) the navigation just proceeds, exactly as it did before.
 */
export function useUnsavedChanges(dirty: boolean) {
  const pathname = usePathname();

  React.useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("download")) return;

      let dest: URL;
      try {
        dest = new URL(href, window.location.href);
      } catch {
        return;
      }
      // Same page (just a query/hash change on this route) — let it through.
      if (dest.origin === window.location.origin && dest.pathname === pathname) return;

      const ok =
        typeof window.confirm !== "function" ||
        window.confirm("You have unsaved changes. Leave this page and discard them?");
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // Capture phase so this runs before Next's Link handler.
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, pathname]);
}
