import * as React from "react";
import { cn } from "@/lib/utils";

/** Bold block card — hard border + offset block-shadow, lifts on hover. */
export function SpotlightCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mps-block mps-block-hover group h-full p-5", className)} {...props}>
      {children}
    </div>
  );
}
