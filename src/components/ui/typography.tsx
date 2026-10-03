import * as React from "react";
import { cn } from "@/lib/utils";

export function TypographyDisplay({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn(
        "font-heading text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  );
}

export function TypographyH1({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn(
        "font-heading text-3xl font-bold tracking-tight sm:text-4xl text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  );
}

export function TypographyH2({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "font-heading text-2xl font-semibold tracking-tight sm:text-3xl text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  );
}

export function TypographyH3({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-heading text-xl font-semibold tracking-tight sm:text-2xl text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  );
}

export function TypographyH4({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h4
      className={cn(
        "font-heading text-lg font-semibold tracking-tight text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  );
}

export function TypographyLead({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-lg sm:text-xl text-[var(--muted-foreground)] leading-relaxed", className)}
      {...props}
    />
  );
}

export function TypographyP({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("leading-7 [&:not(:first-child)]:mt-4 text-[var(--foreground)]", className)}
      {...props}
    />
  );
}

export function TypographyLarge({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-lg font-semibold text-[var(--foreground)]", className)}
      {...props}
    />
  );
}

export function TypographySmall({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <small
      className={cn("text-sm font-medium leading-none text-[var(--muted-foreground)]", className)}
      {...props}
    />
  );
}

export function TypographyMuted({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-[var(--muted-foreground)]", className)}
      {...props}
    />
  );
}

export function TypographyCaption({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("text-xs text-[var(--muted-foreground)] leading-normal", className)}
      {...props}
    />
  );
}

export function TypographyInlineCode({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        "relative rounded bg-[var(--surface-hover)] px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  );
}
