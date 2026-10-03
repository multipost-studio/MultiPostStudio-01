"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      className,
      pressed: controlledPressed,
      defaultPressed = false,
      onPressedChange,
      variant = "default",
      size = "default",
      onClick,
      ...props
    },
    ref
  ) => {
    const [uncontrolledPressed, setUncontrolledPressed] = React.useState(defaultPressed);
    const isPressed = controlledPressed !== undefined ? controlledPressed : uncontrolledPressed;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      const next = !isPressed;
      if (controlledPressed === undefined) {
        setUncontrolledPressed(next);
      }
      onPressedChange?.(next);
    };

    const variantClasses = {
      default: isPressed
        ? "bg-[var(--surface-active,rgba(255,255,255,0.1))] text-[var(--foreground)]"
        : "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--surface-hover,rgba(255,255,255,0.05))] hover:text-[var(--foreground)]",
      outline: isPressed
        ? "border border-[var(--primary)] bg-[var(--primary-soft,rgba(240,118,46,0.1))] text-[var(--primary)]"
        : "border border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--surface-hover,rgba(255,255,255,0.05))] hover:text-[var(--foreground)]",
    };

    const sizeClasses = {
      default: "h-9 px-3 min-w-9 text-sm",
      sm: "h-8 px-2 min-w-8 text-xs",
      lg: "h-10 px-3.5 min-w-10 text-base",
    };

    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={isPressed}
        data-state={isPressed ? "on" : "off"}
        onClick={handleClick}
        className={cn(
          "inline-flex items-center justify-center rounded-[var(--radius-md,8px)] font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Toggle.displayName = "Toggle";

export { Toggle };
