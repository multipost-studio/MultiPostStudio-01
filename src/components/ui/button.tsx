import * as React from "react";
import { Slot } from "@/components/ui/slot";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-text)] hover:bg-[var(--primary-hover)] shadow-[0_10px_24px_-8px_color-mix(in_srgb,var(--primary)_60%,transparent)]",
  secondary:
    "bg-[var(--surface)] text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--surface-hover)] shadow-sm",
  outline:
    "bg-transparent text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
  ghost: "bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
  subtle: "bg-[var(--primary-soft)] text-[var(--primary)] hover:brightness-97",
  danger: "bg-[var(--danger)] text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[14px] gap-1.5 rounded-[var(--radius-sm)] font-semibold",
  md: "h-9.5 px-4 text-[15px] gap-2 rounded-[var(--radius-md)] font-semibold",
  lg: "h-12 px-6 text-[16px] gap-2 rounded-[var(--radius-full)] font-bold hover:-translate-y-0.5 active:translate-y-0",
  icon: "h-9 w-9 justify-center rounded-[var(--radius-md)]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center font-medium transition-all select-none",
          "disabled:opacity-50 disabled:pointer-events-none",
          "focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <span
            aria-hidden
            className="h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent animate-[mps-spin_0.6s_linear_infinite]"
          />
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";
