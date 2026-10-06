import * as React from "react";
import { Slot } from "@/components/ui/slot";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "outline"
  | "subtle"
  | "default"
  | "destructive"
  | "link";

export type ButtonSize = "sm" | "md" | "lg" | "icon" | "default";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-text)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] font-semibold shadow-[var(--glow-flame)] hover:-translate-y-px hover:shadow-[0_14px_38px_-10px_var(--primary-glow)] active:translate-y-0 active:scale-[0.985]",
  default:
    "bg-[var(--primary)] text-[var(--primary-text)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] font-semibold shadow-[var(--glow-flame)] hover:-translate-y-px hover:shadow-[0_14px_38px_-10px_var(--primary-glow)] active:translate-y-0 active:scale-[0.985]",
  secondary:
    "bg-[var(--surface)] text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:border-[var(--text-subtle)] shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.985]",
  outline:
    "bg-transparent text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:border-[var(--text-subtle)] active:scale-[0.985]",
  ghost:
    "bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] active:scale-[0.985]",
  subtle:
    "bg-[var(--primary-soft)] text-[var(--primary-hover)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-hover)] active:scale-[0.985]",
  danger:
    "bg-[var(--danger)] text-[var(--text-inverted)] hover:brightness-110 shadow-sm active:scale-[0.985]",
  destructive:
    "bg-[var(--danger)] text-[var(--text-inverted)] hover:brightness-110 shadow-sm active:scale-[0.985]",
  link:
    "bg-transparent text-[var(--primary-hover)] underline-offset-4 hover:underline p-0 h-auto font-medium",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[14px] gap-1.5 rounded-[var(--radius-sm)] font-semibold",
  md: "h-9.5 px-4 text-[15px] gap-2 rounded-[var(--radius-md)] font-semibold",
  default: "h-9.5 px-4 text-[15px] gap-2 rounded-[var(--radius-md)] font-semibold",
  lg: "h-12 px-6 text-[16px] gap-2 rounded-[var(--radius-lg)] font-bold",
  icon: "h-8 w-8 justify-center rounded-[var(--radius-sm)]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
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
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center font-medium select-none cursor-pointer",
          "transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-[var(--mps-dur-micro)] ease-[var(--mps-ease)]",
          // Directional icons nudge the way they point; nothing else moves.
          "[&_svg.lucide-arrow-right]:transition-transform hover:[&_svg.lucide-arrow-right]:translate-x-0.5",
          "[&_svg.lucide-send]:transition-transform hover:[&_svg.lucide-send]:translate-x-0.5 hover:[&_svg.lucide-send]:-translate-y-px",
          "[&_svg.lucide-upload]:transition-transform hover:[&_svg.lucide-upload]:-translate-y-0.5",
          "[&_svg.lucide-plus]:transition-transform hover:[&_svg.lucide-plus]:rotate-90",
          "disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed",
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
            className="mr-2 h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent animate-[mps-spin_0.6s_linear_infinite]"
          />
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";
