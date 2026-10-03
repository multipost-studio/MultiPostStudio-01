"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextType {
  value: string;
  onValueChange: (v: string) => void;
}

const TabsContext = React.createContext<TabsContextType | null>(null);

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  // Legacy convenience props
  tabs?: { value: string; label: string; count?: number }[];
  label?: string;
}

export function Tabs({
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  tabs,
  label,
  className,
  children,
  ...props
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue || (tabs && tabs[0]?.value) || "",
  );
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const handleValueChange = React.useCallback(
    (v: string) => {
      if (!isControlled) setUncontrolledValue(v);
      onValueChange?.(v);
    },
    [isControlled, onValueChange],
  );

  // Legacy convenience layout when `tabs` array is passed
  if (tabs) {
    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const idx = tabs.findIndex((t) => t.value === value);
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(idx + dir + tabs.length) % tabs.length];
      if (next) handleValueChange(next.value);
    };

    return (
      <div
        className={cn("flex max-w-full gap-1 overflow-x-auto border-b border-[var(--border)]", className)}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        {...props}
      >
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => handleValueChange(t.value)}
              className={cn(
                "relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[14px] font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
                active
                  ? "border-[var(--primary)] text-[var(--text)] font-semibold"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11.5px] tabular-nums font-semibold",
                    active
                      ? "bg-[var(--primary-soft)] text-[var(--primary-hover)]"
                      : "bg-[var(--bg-sunken)] text-[var(--text-subtle)]",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn(
      "inline-flex h-9.5 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 text-[var(--text-muted)]",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, children, ...props }, ref) => {
  const ctx = React.useContext(TabsContext);
  const active = ctx?.value === value;

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? "active" : "inactive"}
      onClick={() => ctx?.onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1 text-[13px] font-medium transition-all outline-none",
        "hover:text-[var(--text)]",
        "focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
        "disabled:pointer-events-none disabled:opacity-50",
        active &&
          "bg-[var(--bg-elevated)] font-semibold text-[var(--text)] shadow-xs border border-[var(--border-strong)]/50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, children, ...props }, ref) => {
  const ctx = React.useContext(TabsContext);
  if (ctx?.value !== value) return null;

  return (
    <div
      ref={ref}
      role="tabpanel"
      data-state="active"
      className={cn("mt-3 outline-none animate-in fade-in-50", className)}
      {...props}
    >
      {children}
    </div>
  );
});
TabsContent.displayName = "TabsContent";
