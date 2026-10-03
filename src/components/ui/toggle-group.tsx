"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";

type ToggleGroupType = "single" | "multiple";

interface ToggleGroupContextValue {
  type: ToggleGroupType;
  value: string | string[];
  onItemClick: (itemValue: string) => void;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline";
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(null);

export interface ToggleGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: ToggleGroupType;
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: any) => void;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline";
}

export function ToggleGroup({
  type = "single",
  value: controlledValue,
  defaultValue,
  onValueChange,
  size = "default",
  variant = "default",
  className,
  children,
  ...props
}: ToggleGroupProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<string | string[]>(
    defaultValue ?? (type === "multiple" ? [] : "")
  );

  const value = controlledValue !== undefined ? controlledValue : uncontrolledValue;

  const onItemClick = (itemValue: string) => {
    if (type === "single") {
      const next = value === itemValue ? "" : itemValue;
      if (controlledValue === undefined) setUncontrolledValue(next);
      onValueChange?.(next);
    } else {
      const currentList = Array.isArray(value) ? value : [];
      const nextList = currentList.includes(itemValue)
        ? currentList.filter((v) => v !== itemValue)
        : [...currentList, itemValue];
      if (controlledValue === undefined) setUncontrolledValue(nextList);
      onValueChange?.(nextList);
    }
  };

  return (
    <ToggleGroupContext.Provider value={{ type, value, onItemClick, size, variant }}>
      <div
        role="group"
        className={cn(
          "inline-flex items-center gap-1 rounded-[var(--radius-md,8px)] p-1",
          variant === "outline" ? "border border-[var(--border)] bg-[var(--bg-sunken,#09090b)]" : "bg-[var(--bg-sunken,#09090b)]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

export interface ToggleGroupItemProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Toggle>, "pressed" | "onPressedChange"> {
  value: string;
}

export const ToggleGroupItem = React.forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  ({ className, value: itemValue, children, ...props }, ref) => {
    const context = React.useContext(ToggleGroupContext);
    if (!context) {
      throw new Error("ToggleGroupItem must be used within a ToggleGroup");
    }

    const isPressed =
      context.type === "single"
        ? context.value === itemValue
        : Array.isArray(context.value) && context.value.includes(itemValue);

    return (
      <Toggle
        ref={ref}
        pressed={isPressed}
        onPressedChange={() => context.onItemClick(itemValue)}
        size={context.size}
        variant={context.variant}
        className={cn("data-[state=on]:bg-[var(--surface,#18181b)] data-[state=on]:text-[var(--foreground,#fafafa)]", className)}
        {...props}
      >
        {children}
      </Toggle>
    );
  }
);
ToggleGroupItem.displayName = "ToggleGroupItem";
