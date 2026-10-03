"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      checked: controlledChecked,
      defaultChecked = false,
      onCheckedChange,
      label,
      description,
      disabled,
      id: idProp,
      name,
      value,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const id = idProp ?? generatedId;
    const [uncontrolledChecked, setUncontrolledChecked] = React.useState(defaultChecked);
    const isControlled = controlledChecked !== undefined;
    const isChecked = isControlled ? controlledChecked : uncontrolledChecked;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      if (!isControlled) setUncontrolledChecked(e.target.checked);
      onCheckedChange?.(e.target.checked);
    };

    const box = (
      <div className="relative inline-flex items-center">
        <input
          ref={ref}
          type="checkbox"
          id={id}
          name={name}
          value={value}
          checked={isChecked}
          disabled={disabled}
          onChange={handleChange}
          className="peer sr-only"
          {...props}
        />
        <label
          htmlFor={id}
          className={cn(
            "flex h-4.5 w-4.5 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] transition-colors",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--ring)] peer-focus-visible:outline-offset-2",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
            isChecked && "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-text)]",
            className,
          )}
        >
          {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
        </label>
      </div>
    );

    if (!label && !description) return box;

    return (
      <div className={cn("flex items-start gap-2.5", disabled && "opacity-50")}>
        <div className="pt-0.5">{box}</div>
        <div className="grid gap-0.5 leading-tight">
          {label && (
            <label
              htmlFor={id}
              className="cursor-pointer text-[14px] font-medium text-[var(--text)] select-none"
            >
              {label}
            </label>
          )}
          {description && (
            <p className="text-[12.5px] text-[var(--text-muted)]">{description}</p>
          )}
        </div>
      </div>
    );
  },
);
Checkbox.displayName = "Checkbox";
