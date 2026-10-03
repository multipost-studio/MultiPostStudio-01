"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const t = document.documentElement.dataset.theme;
  return t === "light" ? "light" : "dark";
}

export function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("mps-theme", next);
  } catch {
    /* private mode: theme just won't persist */
  }
  // Keep the PWA / browser chrome in sync with the active theme.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "light" ? "#FAFAFA" : "#000000");
}

/** Icon button toggle for headers. Renders the dark-state icon until mount
 *  (matching the server markup) so there's never a hydration mismatch. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setThemeState] = React.useState<Theme>("dark");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setThemeState(readTheme());
    setMounted(true);
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        setThemeState(next);
      }}
      aria-pressed={mounted && theme === "light"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-sm)] p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
        className,
      )}
    >
      {theme === "dark" ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
    </button>
  );
}

/** Row toggle for dropdown menus (account menu, mobile nav). */
export function ThemeMenuItem({ onSelect }: { onSelect?: () => void }) {
  const [theme, setThemeState] = React.useState<Theme>("dark");

  React.useEffect(() => {
    setThemeState(readTheme());
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setTheme(next);
        setThemeState(next);
        onSelect?.();
      }}
      className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[14px] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
    >
      {theme === "dark" ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
