import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Surface hierarchy. Every card used to be the same floating surface, so a
 * page of cards read as a wall of equal boxes. Pick the level that matches the
 * information's importance:
 *  - default:     primary card (page > section > this): border, faint shadow
 *  - subtle:      secondary / nested card: sunken tint, border only, no shadow
 *  - flat:        supporting info that should recede: hairline border, no fill
 *  - interactive: a card that is a click target: lifts and tints the border on hover
 * Omitting `variant` is exactly the previous look.
 */
export type CardVariant = "default" | "subtle" | "flat" | "interactive";

const CARD_VARIANTS: Record<CardVariant, string> = {
  default: "border-[var(--border)] bg-[var(--surface)] shadow-xs",
  subtle: "border-[var(--border)] bg-[var(--bg-sunken)]",
  flat: "border-[var(--border)] bg-transparent",
  interactive:
    "border-[var(--border)] bg-[var(--surface)] shadow-xs transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0",
};

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }
>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-[var(--radius-lg)] border text-[var(--text)] transition-colors",
      CARD_VARIANTS[variant],
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 p-4 pb-2 sm:p-5 sm:pb-3",
      className,
    )}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-[16px] font-semibold tracking-tight text-[var(--text)] leading-snug",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-[13.5px] text-[var(--text-muted)] mt-0.5 leading-relaxed", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("p-4 pt-2 sm:p-5 sm:pt-2", className)}
    {...props}
  />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-wrap items-center gap-2 border-t border-[var(--border)] p-4 sm:px-5",
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
