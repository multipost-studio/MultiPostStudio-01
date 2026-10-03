import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "default" | "lg" | "xl";
  className?: string;
  label?: string;
}

export function Spinner({
  size = "default",
  className,
  label = "Loading...",
  ...props
}: SpinnerProps) {
  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    default: "h-4 w-4",
    lg: "h-6 w-6",
    xl: "h-8 w-8",
  };

  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center justify-center text-[var(--primary)]", className)}
      {...props}
    >
      <Loader2 className={cn("animate-spin", sizeClasses[size])} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
