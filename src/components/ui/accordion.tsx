"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionContextValue {
  value: string[];
  toggleItem: (itemValue: string) => void;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: "single" | "multiple";
  collapsible?: boolean;
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: any) => void;
}

export function Accordion({
  type = "single",
  collapsible = true,
  value: controlledValue,
  defaultValue,
  onValueChange,
  className,
  children,
  ...props
}: AccordionProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<string[]>(() => {
    if (defaultValue) {
      return Array.isArray(defaultValue) ? defaultValue : [defaultValue];
    }
    return [];
  });

  const rawValue = controlledValue !== undefined ? controlledValue : uncontrolledValue;
  const value = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [];

  const toggleItem = (itemValue: string) => {
    let next: string[];
    if (type === "single") {
      if (value.includes(itemValue)) {
        next = collapsible ? [] : [itemValue];
      } else {
        next = [itemValue];
      }
    } else {
      if (value.includes(itemValue)) {
        next = value.filter((v) => v !== itemValue);
      } else {
        next = [...value, itemValue];
      }
    }

    if (controlledValue === undefined) {
      setUncontrolledValue(next);
    }
    onValueChange?.(type === "single" ? (next[0] ?? "") : next);
  };

  return (
    <AccordionContext.Provider value={{ value, toggleItem }}>
      <div className={cn("divide-y divide-[var(--border)]", className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemContextValue {
  value: string;
  isOpen: boolean;
}

const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null);

export const AccordionItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, children, ...props }, ref) => {
  const context = React.useContext(AccordionContext);
  const isOpen = context?.value.includes(value) ?? false;

  return (
    <AccordionItemContext.Provider value={{ value, isOpen }}>
      <div
        ref={ref}
        data-state={isOpen ? "open" : "closed"}
        className={cn("border-b border-[var(--border)]", className)}
        {...props}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
});
AccordionItem.displayName = "AccordionItem";

export const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const accordionContext = React.useContext(AccordionContext);
  const itemContext = React.useContext(AccordionItemContext);

  if (!accordionContext || !itemContext) {
    throw new Error("AccordionTrigger must be used inside Accordion and AccordionItem");
  }

  const { isOpen, value } = itemContext;

  return (
    <h3 className="flex">
      <button
        ref={ref}
        type="button"
        aria-expanded={isOpen}
        data-state={isOpen ? "open" : "closed"}
        onClick={() => accordionContext.toggleItem(value)}
        className={cn(
          "flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline",
          "[&[data-state=open]>svg]:rotate-180 text-[var(--foreground)]",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 text-[var(--muted-foreground)]" />
      </button>
    </h3>
  );
});
AccordionTrigger.displayName = "AccordionTrigger";

export const AccordionContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const itemContext = React.useContext(AccordionItemContext);
  if (!itemContext) {
    throw new Error("AccordionContent must be used inside an AccordionItem");
  }

  if (!itemContext.isOpen) return null;

  return (
    <div
      ref={ref}
      data-state={itemContext.isOpen ? "open" : "closed"}
      className={cn("overflow-hidden text-sm pb-4 pt-0 text-[var(--muted-foreground)]", className)}
      {...props}
    >
      {children}
    </div>
  );
});
AccordionContent.displayName = "AccordionContent";
