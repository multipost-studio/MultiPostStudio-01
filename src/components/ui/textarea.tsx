import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-[14.5px] leading-relaxed text-[var(--text)] shadow-xs transition-colors",
          "placeholder:text-[var(--text-subtle)]",
          "focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-1 focus-visible:border-[var(--primary)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
