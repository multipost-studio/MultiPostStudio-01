"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface CalendarProps {
  selected?: Date;
  onSelect?: (date: Date) => void;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

export function Calendar({
  selected,
  onSelect,
  className,
  minDate,
  maxDate,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(
    () => selected ?? new Date()
  );

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const isSelected = (day: number) => {
    if (!selected) return false;
    return (
      selected.getDate() === day &&
      selected.getMonth() === month &&
      selected.getFullYear() === year
    );
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      today.getDate() === day &&
      today.getMonth() === month &&
      today.getFullYear() === year
    );
  };

  const isDisabled = (day: number) => {
    const current = new Date(year, month, day);
    if (minDate && current < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) {
      return true;
    }
    if (maxDate && current > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) {
      return true;
    }
    return false;
  };

  return (
    <div className={cn("p-3 bg-[var(--card)] rounded-[var(--radius-lg,12px)] border border-[var(--border)]", className)}>
      <div className="flex items-center justify-between pb-3">
        <h4 className="text-sm font-semibold text-[var(--foreground)]">
          {monthNames[month]} {year}
        </h4>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={prevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={nextMonth}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-[var(--muted-foreground)] mb-1">
        {daysOfWeek.map((d) => (
          <div key={d} className="h-8 flex items-center justify-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-sm">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-8 w-8" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const selectedDay = isSelected(day);
          const today = isToday(day);
          const disabled = isDisabled(day);

          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onSelect?.(new Date(year, month, day))}
              className={cn(
                "h-8 w-8 mx-auto flex items-center justify-center rounded-[var(--radius-md,8px)] text-xs font-medium transition-colors",
                "hover:bg-[var(--surface-hover,rgba(255,255,255,0.05))]",
                selectedDay && "bg-[var(--primary)] text-[var(--primary-foreground,#ffffff)] hover:bg-[var(--primary)]",
                !selectedDay && today && "border border-[var(--primary)] text-[var(--primary)]",
                !selectedDay && !today && "text-[var(--foreground)]",
                disabled && "opacity-30 cursor-not-allowed pointer-events-none"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
