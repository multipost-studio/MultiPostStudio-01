import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[15px] text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)] disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, "h-9.5 px-3", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-[80px] px-3 py-2 leading-relaxed resize-y", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(base, "h-9.5 px-3 pr-8 appearance-none bg-no-repeat", className)}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%238a909e' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
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
  return (
    <div className={cn("space-y-1", className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p className="text-[13px] text-[var(--danger)]">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-[var(--text-subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}
