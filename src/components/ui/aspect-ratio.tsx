import * as React from "react";
import { cn } from "@/lib/utils";

export interface AspectRatioProps extends React.HTMLAttributes<HTMLDivElement> {
  ratio?: number;
}

export function AspectRatio({
  ratio = 16 / 9,
  className,
  style,
  children,
  ...props
}: AspectRatioProps) {
  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      style={{
        paddingBottom: `${(1 / ratio) * 100}%`,
        ...style,
      }}
      {...props}
    >
      <div className="absolute inset-0 h-full w-full">{children}</div>
    </div>
  );
}
