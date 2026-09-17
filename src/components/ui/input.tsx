"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-colors focus:border-[var(--primary)] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-1 disabled:opacity-50";

/**
 * Control sizes deliberately mirror Button's `sizes` map — same heights, same
 * radii — so an Input and a Button placed side by side always line up.
 * Input previously had a single fixed height with no `lg`, which is why the
 * marketing hero hand-rolled a 52px input and paired it with a pill button.
 */
export const controlSizes = {
  sm: "h-8 px-2.5 text-[14px] rounded-[var(--radius-sm)]",
  md: "h-9.5 px-3 text-[15px] rounded-[var(--radius-md)]",
  lg: "h-12 px-4 text-[16px] rounded-[var(--radius-lg)]",
} as const;

export type ControlSize = keyof typeof controlSizes;

export const Input = React.forwardRef<
  HTMLInputElement,
  // Native <input size> is a character count; ours is the control scale, so the
  // DOM attribute is omitted rather than intersected (which resolved to never).
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: ControlSize }
>(({ className, size = "md", ...props }, ref) => (
  <input ref={ref} className={cn(base, controlSizes[size], className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-[80px] rounded-[var(--radius-md)] px-3 py-2 text-[15px] leading-relaxed resize-y", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  // Native <select size> is a row count; ours is the control scale.
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: ControlSize }
>(({ className, size = "md", ...props }, ref) => (
  <select ref={ref} className={cn(base, controlSizes[size], "pr-8 appearance-none bg-no-repeat", className)}
    style={{
      // currentColor so the chevron follows the theme instead of a hardcoded
      // gray that clashed in dark mode.
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='currentColor' stroke-width='2' viewBox='0 0 24 24' opacity='0.55'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      backgroundPosition: "right 0.6rem center",
    }}
    {...props}
  />
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("block text-[14px] font-medium text-[var(--text)] mb-1.5", className)} {...props} />
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  // Only 9 of ~150 <Field> call sites passed `htmlFor`, so almost every label
  // in the app was decorative: screen readers announced the input as blank and
  // clicking the label didn't focus it. Generating the id here and injecting it
  // into the child wires all of them up without touching the call sites.
  const autoId = React.useId();
  const id = htmlFor ?? autoId;
  // Hint/error get ids so screen readers announce them with the field —
  // previously they were plain <p> with no programmatic association.
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(" ");
  const described = React.isValidElement(children)
    ? React.cloneElement(
        children as React.ReactElement<{ id?: string; "aria-describedby"?: string }>,
        {
          // Never clobber an id the caller set deliberately.
          id: (children.props as { id?: string }).id ?? id,
          ...(describedBy ? { "aria-describedby": describedBy } : {}),
        },
      )
    : children;

  return (
    <div className={cn("space-y-1", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {described}
      {error ? (
        <p id={errorId} className="text-[13px] text-[var(--danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-[var(--text-subtle)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
