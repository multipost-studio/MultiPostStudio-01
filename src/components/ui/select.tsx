"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectContextType {
  value: string;
  onValueChange: (v: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  labelMap: Map<string, React.ReactNode>;
  registerLabel: (val: string, label: React.ReactNode) => void;
}

const SelectContext = React.createContext<SelectContextType | null>(null);

export function Select({
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [labelMap, setLabelMap] = React.useState(() => new Map<string, React.ReactNode>());

  const isControlledValue = controlledValue !== undefined;
  const value = isControlledValue ? controlledValue : uncontrolledValue;

  const isControlledOpen = controlledOpen !== undefined;
  const open = isControlledOpen ? controlledOpen : uncontrolledOpen;

  const handleValueChange = React.useCallback(
    (v: string) => {
      if (!isControlledValue) setUncontrolledValue(v);
      onValueChange?.(v);
      if (!isControlledOpen) setUncontrolledOpen(false);
      onOpenChange?.(false);
    },
    [isControlledValue, onValueChange, isControlledOpen, onOpenChange],
  );

  const setOpen = React.useCallback(
    (v: boolean) => {
      if (!isControlledOpen) setUncontrolledOpen(v);
      onOpenChange?.(v);
    },
    [isControlledOpen, onOpenChange],
  );

  const registerLabel = React.useCallback((val: string, label: React.ReactNode) => {
    setLabelMap((prev) => {
      const next = new Map(prev);
      next.set(val, label);
      return next;
    });
  }, []);

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange: handleValueChange,
        open,
        setOpen,
        labelMap,
        registerLabel,
      }}
    >
      <div className="relative inline-block w-full">{children}</div>
    </SelectContext.Provider>
  );
}

export const SelectGroup = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("py-1", className)} {...props} />
);
SelectGroup.displayName = "SelectGroup";

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = React.useContext(SelectContext);
  if (!ctx) return null;

  const display = ctx.value ? ctx.labelMap.get(ctx.value) ?? ctx.value : null;

  return (
    <span className={cn("block truncate text-left", !display && "text-[var(--text-subtle)]")}>
      {display || placeholder}
    </span>
  );
}

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext);

  return (
    <button
      ref={ref}
      type="button"
      role="combobox"
      aria-expanded={ctx?.open}
      onClick={() => ctx?.setOpen(!ctx?.open)}
      className={cn(
        "flex h-9.5 w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-[14px] text-[var(--text)] shadow-xs transition-colors",
        "focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-1 focus-visible:border-[var(--primary)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 opacity-50 transition-transform duration-200" />
    </button>
  );
});
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!ctx?.open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        ctx.setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ctx]);

  if (!ctx?.open) return null;

  return (
    <div
      ref={contentRef}
      className={cn(
        "absolute z-[var(--z-dropdown)] mt-1.5 max-h-60 w-full overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 text-[var(--text)] shadow-lg animate-in fade-in-0 zoom-in-95",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
SelectContent.displayName = "SelectContent";

export const SelectLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-subtle)]", className)}
    {...props}
  />
));
SelectLabel.displayName = "SelectLabel";

export const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string; disabled?: boolean }
>(({ className, value, disabled, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext);
  const isSelected = ctx?.value === value;

  React.useEffect(() => {
    ctx?.registerLabel(value, children);
  }, [value, children, ctx]);

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      data-disabled={disabled ? "" : undefined}
      onClick={() => {
        if (disabled) return;
        ctx?.onValueChange(value);
      }}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-[var(--radius-sm)] py-1.5 pl-8 pr-2 text-[13.5px] outline-none transition-colors",
        "text-[var(--text)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        disabled && "pointer-events-none opacity-50",
        isSelected && "font-semibold text-[var(--primary)] bg-[var(--primary-soft)]/40",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4 text-[var(--primary)]" />}
      </span>
      {children}
    </div>
  );
});
SelectItem.displayName = "SelectItem";

export const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-[var(--border)]", className)}
    {...props}
  />
));
SelectSeparator.displayName = "SelectSeparator";
