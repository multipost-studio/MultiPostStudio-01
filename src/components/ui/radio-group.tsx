"use client";

import * as React from "react";
import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RadioGroupContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
}

export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  (
    {
      className,
      value: controlledValue,
      defaultValue,
      onValueChange,
      name,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    const value = controlledValue !== undefined ? controlledValue : uncontrolledValue;

    const handleValueChange = (val: string) => {
      if (controlledValue === undefined) {
        setUncontrolledValue(val);
      }
      onValueChange?.(val);
    };

    return (
      <RadioGroupContext.Provider
        value={{ value, onValueChange: handleValueChange, name, disabled }}
      >
        <div ref={ref} role="radiogroup" className={cn("grid gap-2", className)} {...props}>
          {children}
        </div>
      </RadioGroupContext.Provider>
    );
  }
);
RadioGroup.displayName = "RadioGroup";

export interface RadioGroupItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const RadioGroupItem = React.forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({ className, value, id, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext);
    if (!context) {
      throw new Error("RadioGroupItem must be used within a RadioGroup");
    }

    const isChecked = context.value === value;
    const isDisabled = props.disabled || context.disabled;

    return (
      <button
        ref={ref}
        type="button"
        role="radio"
        id={id}
        aria-checked={isChecked}
        data-state={isChecked ? "checked" : "unchecked"}
        disabled={isDisabled}
        onClick={() => context.onValueChange?.(value)}
        className={cn(
          "aspect-square h-4 w-4 rounded-full border border-[var(--primary)] text-[var(--primary)] ring-offset-[var(--background)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !isChecked && "border-[var(--muted-foreground)]",
          className
        )}
        {...props}
      >
        {isChecked && (
          <span className="flex items-center justify-center">
            <Circle className="h-2.5 w-2.5 fill-current text-current" />
          </span>
        )}
      </button>
    );
  }
);
RadioGroupItem.displayName = "RadioGroupItem";
