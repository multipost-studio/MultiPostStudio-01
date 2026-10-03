"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
  className?: string;
  disabled?: boolean;
}

export function Slider({
  value: controlledValue,
  defaultValue = [0],
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  className,
  disabled,
}: SliderProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const value = controlledValue !== undefined ? controlledValue : uncontrolledValue;
  const currentVal = value[0] ?? min;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = [parseFloat(e.target.value)];
    if (controlledValue === undefined) {
      setUncontrolledValue(next);
    }
    onValueChange?.(next);
  };

  const percentage = Math.min(100, Math.max(0, ((currentVal - min) / (max - min)) * 100));

  return (
    <div className={cn("relative flex w-full touch-none select-none items-center", className)}>
      <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-[var(--bg-sunken,#09090b)]">
        <div
          className="h-full bg-[var(--primary)] transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentVal}
        disabled={disabled}
        onChange={handleChange}
        className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
      <div
        className="pointer-events-none absolute h-4 w-4 rounded-full border-2 border-[var(--primary)] bg-[var(--background)] ring-offset-[var(--background)] shadow transition-colors"
        style={{ left: `calc(${percentage}% - 8px)` }}
      />
    </div>
  );
}
