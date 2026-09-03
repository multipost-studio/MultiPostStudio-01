"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** g-prefixed navigation + single-key actions. `?` toggles the cheatsheet. */
const NAV_KEYS: Record<string, string> = {
  d: "/dashboard",
  c: "/calendar",
  a: "/analytics",
  q: "/queue",
  i: "/inbox",
  m: "/media",
  t: "/team",
  p: "/composer",
  s: "/settings/profile",
};

const SHEET: [string, string][] = [
  ["c", "New post"],
  ["/", "Command menu"],
  ["g then d", "Dashboard"],
  ["g then c", "Calendar"],
  ["g then q", "Queue"],
  ["g then a", "Analytics"],
  ["g then i", "Inbox"],
  ["g then p", "Posts"],
  ["g then m", "Media"],
  ["g then t", "Team"],
  ["?", "This help"],
];

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

export function KeyboardShortcuts({ onOpenCommand }: { onOpenCommand: () => void }) {
  const router = useRouter();
  const [help, setHelp] = React.useState(false);
  const awaitingG = React.useRef(false);
  const gTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;

      if (awaitingG.current) {
        awaitingG.current = false;
        if (gTimer.current) clearTimeout(gTimer.current);
        const dest = NAV_KEYS[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }

      if (e.key === "g") {
        awaitingG.current = true;
        gTimer.current = setTimeout(() => (awaitingG.current = false), 800);
        return;
      }
      if (e.key === "c") {
        e.preventDefault();
        router.push("/composer/new");
      } else if (e.key === "/") {
        e.preventDefault();
        onOpenCommand();
      } else if (e.key === "?") {
        e.preventDefault();
        setHelp((v) => !v);
      } else if (e.key === "Escape") {
        setHelp(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, onOpenCommand]);

  if (!help) return null;
  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center p-4" onClick={() => setHelp(false)}>
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-lg"
      >
        <p className="mb-3 text-[15px] font-semibold text-[var(--text)]">Keyboard shortcuts</p>
        <ul className="space-y-1.5">
          {SHEET.map(([k, label]) => (
            <li key={k} className="flex items-center justify-between text-[13px]">
              <span className="text-[var(--text-muted)]">{label}</span>
              <kbd className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text)]">
                {k}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-[var(--text-subtle)]">Press ? again or Esc to close.</p>
      </div>
    </div>
  );
}
