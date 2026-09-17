"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Slot } from "@/components/ui/slot";

export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
  label,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
  /** Accessible name for the trigger when its content is icon-only. */
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (triggerRef.current as HTMLElement | null)?.focus?.();
      }
      // Basic menu keyboard support: arrows move between items. Skipped
      // inside text fields (e.g. the workspace-switcher search input) so
      // typing and caret movement keep working there.
      const inField = (e.target as HTMLElement | null)?.closest?.("input, textarea, select");
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !inField) {
        const items = Array.from(
          menuRef.current?.querySelectorAll<HTMLElement>("[role^='menuitem'], a[href], button") ?? [],
        ).filter((el) => !el.hasAttribute("disabled"));
        if (items.length === 0) return;
        e.preventDefault();
        const idx = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  // Inject menu-button semantics into the caller's trigger (all call sites
  // already render a <button>) instead of wrapping it — a <button> inside a
  // <button> is invalid HTML with double tab stops. Non-element triggers get
  // a real button wrapper.
  const triggerEl = React.isValidElement(trigger) ? (
    React.cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
      // Callback ref (runs at commit time, not render): keeps our return-focus
      // ref and forwards to a function ref the caller may have set. Object
      // refs are intentionally not forwarded (reassigning them trips the
      // immutability rule, and no in-repo trigger uses one — all plain
      // buttons, which need no ref).
      ref: (el: HTMLElement | null) => {
        triggerRef.current = el;
        const prev = (trigger as React.ReactElement<Record<string, unknown>>).props.ref;
        if (typeof prev === "function") {
          (prev as (el: HTMLElement | null) => void)(el);
        }
      },
      "aria-haspopup": "menu",
      "aria-expanded": open,
      ...(label ? { "aria-label": label } : {}),
      onClick: (e: React.MouseEvent) => {
        ((trigger as React.ReactElement<Record<string, unknown>>).props.onClick as
          | ((e: React.MouseEvent) => void)
          | undefined)?.(e);
        setOpen((o) => !o);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        ((trigger as React.ReactElement<Record<string, unknown>>).props.onKeyDown as
          | ((e: React.KeyboardEvent) => void)
          | undefined)?.(e);
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        }
      },
    })
  ) : (
    <button
      ref={triggerRef as React.Ref<HTMLButtonElement>}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={label}
      onClick={() => setOpen((o) => !o)}
      className="flex items-center rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-1"
    >
      {trigger}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      {triggerEl}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onClick={(e) => {
            // Keep the menu (and any <form action> inside it) mounted while a
            // form submits — server actions dispatch async.
            if ((e.target as HTMLElement).closest("form")) return;
            setOpen(false);
          }}
          className={cn(
            "mps-scale-in absolute z-[var(--z-dropdown)] mt-1.5 max-h-[320px] min-w-[200px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  className,
  destructive,
  disabled,
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean; asChild?: boolean }) {
  // asChild renders a single Link (or other element) with menuitem styling
  // instead of nesting it inside a <button> — <button><a> is invalid HTML
  // with double tab stops. The menu container still closes on click.
  if (asChild) {
    return (
      <Slot
        role="menuitem"
        className={cn(
          "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[14px] transition-colors",
          "hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
          destructive ? "text-[var(--danger)]" : "text-[var(--text)]",
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <button
      role="menuitem"
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[14px] transition-colors",
        "hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        destructive ? "text-[var(--danger)]" : "text-[var(--text)]",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
      {children}
    </p>
  );
}

export function MenuSeparator() {
  return <div className="my-1 border-t border-[var(--border)]" />;
}
