"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type CalendarPost = {
  id: string;
  title: string;
  slug: string;
  status: string;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  author: { name: string } | null;
  category: { name: string } | null;
};

export function BlogCalendarClient({ initialPosts }: { initialPosts: CalendarPost[] }) {
  const [currentDate, setCurrentDate] = React.useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // Group posts by date string YYYY-MM-DD
  const postsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of initialPosts) {
      const d = p.scheduledAt || p.publishedAt;
      if (!d) continue;
      const key = new Date(d).toISOString().slice(0, 10);
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    }
    return map;
  }, [initialPosts]);

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {/* Calendar Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <CalendarIcon size={20} className="text-[var(--primary)]" />
          <h2 className="text-lg font-bold text-[var(--text)]">
            {monthNames[month]} {year}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth} className="h-8 w-8 p-0">
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="text-[12px]">
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={nextMonth} className="h-8 w-8 p-0">
            <ChevronRight size={16} />
          </Button>
          <Link href="/admin/blog/new">
            <Button variant="primary" size="sm" className="gap-1 shadow-xs ml-2">
              <Plus size={14} />
              <span>Schedule Post</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-xs">
        {/* Days of week */}
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-hover)] text-center text-[12px] font-semibold text-[var(--text-subtle)]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="py-2.5">
              {day}
            </div>
          ))}
        </div>

        {/* Days cells */}
        <div className="grid grid-cols-7 auto-rows-[120px] divide-x divide-y divide-[var(--border)]">
          {/* Empty cells before month starts */}
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-[var(--surface-hover)]/30 p-2 text-[12px] text-[var(--text-subtle)]" />
          ))}

          {/* Actual days */}
          {daysArray.map((day) => {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const posts = postsByDate.get(dateStr) || [];
            const isToday =
              new Date().toISOString().slice(0, 10) === dateStr;

            return (
              <div
                key={day}
                className={`flex flex-col justify-between p-2 text-[12px] transition-colors hover:bg-[var(--surface-hover)]/40 ${
                  isToday ? "bg-[var(--primary-soft)]/20" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`h-6 w-6 flex items-center justify-center rounded-full font-semibold tabular-nums ${
                      isToday
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--text)]"
                    }`}
                  >
                    {day}
                  </span>
                  {posts.length > 0 && (
                    <span className="text-[10px] text-[var(--text-subtle)]">{posts.length}</span>
                  )}
                </div>

                <div className="mt-1 space-y-1 overflow-y-auto max-h-[80px]">
                  {posts.map((p) => {
                    const isPublished = p.status === "published";
                    return (
                      <Link
                        key={p.id}
                        href={`/admin/blog/${p.id}`}
                        className={`block truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight ${
                          isPublished
                            ? "bg-[var(--success-soft)] text-[var(--success)]"
                            : "bg-[var(--info-soft)] text-[var(--info)]"
                        }`}
                        title={p.title}
                      >
                        {p.status === "scheduled" && "⏰ "}
                        {p.title}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
