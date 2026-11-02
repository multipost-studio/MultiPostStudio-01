"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, Plus, X } from "lucide-react";
import {
  DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { confirmDestructive } from "@/components/ui/confirm";
import { Select } from "@/components/ui/input";
import { PlatformBadge } from "@/components/brand";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/ui/toast";
import { Checkbox } from "@/components/ui/controls";
import { InlineEmpty } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import { useCalendarTimeZone } from "@/lib/use-calendar-timezone";
import { TimeZonePicker } from "@/components/time-zone-picker";
import { dayKeyIn, floatingDayIn, formatShortDateIn, formatTimeIn, wallTimeToInstant, zonedParts } from "@/lib/tz-math";
import { rescheduleAction, bulkDeletePostsAction, bulkDuplicatePostsAction, bulkUnschedulePostsAction } from "@/app/actions/posts";
import { ImportPostsButton } from "./calendar-import";

type P = {
  id: string;
  title: string;
  status: string;
  campaignId: string | null;
  pillarId: string | null;
  when: string;
  platforms: string[];
  channelIds: string[];
};

type View = "month" | "week" | "day" | "list";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** The time zone the calendar is showing, and today's day in it. Everything that shows a time or decides a day reads it. */
const ZoneContext = React.createContext<{ tz: string; todayKey: string }>({ tz: "UTC", todayKey: "" });

const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function CalendarView({
  posts: initial,
  channels,
  campaigns,
  pillars,
  canEdit,
  bestTimes,
  initialCampaign,
  undated = [],
  profileTimezone,
  workspaceTimezone,
}: {
  posts: P[];
  /** Drafts and approvals with no date yet (shown in the "No date" panel, not on the grid). */
  undated?: P[];
  /** The person's own and the workspace's time zones: offered as suggestions in the time zone menu. */
  profileTimezone?: string | null;
  workspaceTimezone?: string | null;
  channels: { id: string; name: string; platform: string }[];
  campaigns: { id: string; name: string; color: string }[];
  pillars: { id: string; name: string; color: string }[];
  canEdit: boolean;
  bestTimes?: { bestWeekday: number | null; bestHour: number | null; note: string; insufficient?: boolean };
  initialCampaign?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  // Today, each post's day and its time all depend on the visitor's time zone, which the server (UTC) can't know. Showing them
  // during hydration made the server and browser HTML differ ("Hydration failed"), so they appear right after the page loads.
  const hydrated = useHydrated();
  // Which time zone the calendar shows (the device's unless the person chose one). Posts keep their real instant; only the day and
  // time they appear on change.
  const { timeZone: tz, deviceZone, setTimeZone } = useCalendarTimeZone();
  const todayKey = dayKeyIn(new Date(), tz);
  const zone = React.useMemo(() => ({ tz, todayKey }), [tz, todayKey]);
  const [posts, setPosts] = React.useState(initial);
  /* Mobile-first: a 7-column month grid is unreadable at 320–480px, so small
     screens open on the agenda (list) view — the desktop default stays month.
     Done in an effect (not the useState initializer) so SSR and the first
     client render agree on "month" with no hydration mismatch. */
  const [view, setView] = React.useState<View>("month");
  React.useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setView((v) => (v === "month" ? "list" : v));
  }, []);
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  // Once the page is live, "today" is today in the chosen zone (the first render only knows the server's day).
  const syncedToday = React.useRef(false);
  React.useEffect(() => {
    if (!hydrated || syncedToday.current) return;
    syncedToday.current = true;
    setCursor(floatingDayIn(new Date(), tz));
  }, [hydrated, tz]);
  const [fChannel, setFChannel] = React.useState("");
  const [fStatus, setFStatus] = React.useState("");
  const [fCampaign, setFCampaign] = React.useState(initialCampaign ?? "");
  const [fPillar, setFPillar] = React.useState("");
  const [panelOpen, setPanelOpen] = React.useState(false);
  // An empty result means different things with and without filters, so the
  // empty state branches: one offers a way out, the other explains the view.
  const hasFilters = Boolean(fChannel || fStatus || fCampaign || fPillar);
  const clearFilters = () => {
    setFChannel("");
    setFStatus("");
    setFCampaign("");
    setFPillar("");
  };

  React.useEffect(() => setPosts(initial), [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    /* Touch long-press to drag: without this, a touch starting on a chip
       fights the page scroll (drag wins or scroll janks). The 250ms delay
       keeps tap-to-open and swipe-to-scroll intact on phones. */
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const matches = (p: P) =>
    (!fChannel || p.channelIds.includes(fChannel)) &&
    (!fStatus || p.status === fStatus) &&
    (!fCampaign || p.campaignId === fCampaign) &&
    (!fPillar || p.pillarId === fPillar);
  const filtered = posts.filter(matches);
  const filteredUndated = undated.filter(matches);

  const openDay = (d: Date) => {
    setCursor(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    setView("day");
  };

  const byDay = React.useMemo(() => {
    const m = new Map<string, P[]>();
    for (const p of filtered) {
      const k = dayKeyIn(new Date(p.when), tz);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    for (const arr of m.values()) arr.sort((a, b) => +new Date(a.when) - +new Date(b.when));
    return m;
  }, [filtered, tz]);

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const id = String(e.active.id);
    const [y, mo, da] = String(e.over.id).split("-").map(Number);
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    const old = new Date(post.when);
    const oldParts = zonedParts(old, tz);
    const next = wallTimeToInstant(y, mo, da, oldParts.hour || 9, oldParts.minute || 0, tz);
    if (dayKeyIn(old, tz) === dayKeyIn(next, tz)) return;
    if (next.getTime() < Date.now() - 60_000) {
      toast({ title: "Can't schedule in the past", tone: "error" });
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, when: next.toISOString() } : p)));
    const res = await rescheduleAction(id, next.toISOString());
    if (!res.ok) {
      toast({ title: "Reschedule failed", description: res.error, tone: "error" });
      setPosts(initial);
    } else {
      toast({ title: "Rescheduled", tone: "success" });
      router.refresh();
    }
  }

  const move = (dir: number) => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  };

  const label =
    view === "month"
      ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : view === "day"
        ? cursor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : `Week of ${cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Drag a post to another day to reschedule it."
        tourId="calendar"
        wash="d"
        actions={
          <div className="flex items-center gap-2">
            {canEdit && <ImportPostsButton />}
            <Button asChild size="sm">
              <Link href="/composer/new">
                <Plus size={15} /> New post
              </Link>
            </Button>
          </div>
        }
      />

      {/* One row: where you are on the left (previous / next, the month, Today, the view), what you see on the right
          (filters, drafts with no date, your time zone). Campaign and pillar filters only appear once there are any. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex shrink-0 items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label="Previous">
            <ChevronLeft size={16} />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label="Next">
            <ChevronRight size={16} />
          </Button>
          <span className="ml-1 min-w-[132px] text-[15px] font-semibold text-[var(--text)] sm:min-w-[170px] sm:text-[16px]">{hydrated ? label : "\u00a0"}</span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setCursor(floatingDayIn(new Date(), tz))}>
          Today
        </Button>
        <Select aria-label="Calendar view" value={view} onChange={(e) => setView(e.target.value as View)} size="sm" className="w-auto shrink-0">
          <option value="month">Month</option>
          <option value="week">Week</option>
          <option value="day">Day</option>
          <option value="list">List</option>
        </Select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select aria-label="Filter by channel" value={fChannel} onChange={(e) => setFChannel(e.target.value)} size="sm" className="w-auto shrink-0">
            <option value="">All channels</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.platform}</option>
            ))}
          </Select>
          <Select aria-label="Filter by status" value={fStatus} onChange={(e) => setFStatus(e.target.value)} size="sm" className="w-auto shrink-0">
            <option value="">All posts</option>
            {["scheduled", "approved", "awaiting_approval", "published", "failed"].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </Select>
          {(campaigns.length > 0 || fCampaign) && (
            <Select aria-label="Filter by campaign" value={fCampaign} onChange={(e) => setFCampaign(e.target.value)} size="sm" className="w-auto shrink-0">
              <option value="">All campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
          {pillars.length > 0 && (
            <Select aria-label="Filter by pillar" value={fPillar} onChange={(e) => setFPillar(e.target.value)} size="sm" className="w-auto shrink-0">
              <option value="">All pillars</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          )}
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="text-[12.5px] font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline">
              Clear filters
            </button>
          )}
          <Button size="sm" variant={panelOpen ? "secondary" : "ghost"} aria-pressed={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
            <FileText size={14} /> No date{filteredUndated.length > 0 && <span className="ml-1 rounded-full bg-[var(--primary-soft)] px-1.5 text-[11px] font-semibold text-[var(--primary)]">{filteredUndated.length}</span>}
          </Button>
          {hydrated && (
            <TimeZonePicker
              value={tz}
              onChange={setTimeZone}
              deviceZone={deviceZone}
              suggestions={[
                ...(profileTimezone ? ([[profileTimezone, "Your profile"]] as [string, string][]) : []),
                ...(workspaceTimezone ? ([[workspaceTimezone, "Workspace"]] as [string, string][]) : []),
              ]}
            />
          )}
        </div>
      </div>

      {bestTimes && !bestTimes.insufficient && bestTimes.bestWeekday != null && bestTimes.bestHour != null && (
        <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary-soft)]/40 px-3 py-2 text-[13px] text-[var(--text-muted)]">
          <span className="font-medium text-[var(--primary)]">Best time to post:</span>
          <span>
            {DOW_LONG[bestTimes.bestWeekday]}s around {bestTimes.bestHour}:00
          </span>
          <span className="hidden text-[var(--text-subtle)] sm:inline">· {bestTimes.note}</span>
        </div>
      )}

      {fCampaign && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--primary)]/30 bg-[var(--primary-soft)]/30 px-3 py-1.5 text-[12.5px]">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[var(--primary)]">Filtered by Campaign:</span>
            <span className="font-medium text-[var(--text)]">
              {campaigns.find((c) => c.id === fCampaign)?.name ?? "Selected Campaign"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFCampaign("")}
            className="text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] underline cursor-pointer"
          >
            Clear filter
          </button>
        </div>
      )}

      {!hydrated && <div aria-hidden="true" data-calendar-placeholder className="h-[420px] animate-pulse rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-sunken)]/50" />}
      {hydrated && (
      <ZoneContext.Provider value={zone}>
      <div className={cn("grid items-start gap-4", panelOpen && "lg:grid-cols-[minmax(0,1fr)_280px]")}>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div key={`${view}-${cursor.getFullYear()}-${cursor.getMonth()}-${view === "month" ? 0 : cursor.getDate()}`} className="mps-swap min-w-0 overflow-x-auto mps-scroll-x">
          {view === "month" && <MonthGrid cursor={cursor} byDay={byDay} canEdit={canEdit} onOpenDay={openDay} />}
          {view === "week" && <WeekGrid cursor={cursor} byDay={byDay} canEdit={canEdit} onOpenDay={openDay} />}
          {view === "day" && <DayList cursor={cursor} posts={byDay.get(ymd(cursor)) ?? []} />}
          {view === "list" && (
            <ListView posts={filtered} canEdit={canEdit} hasFilters={hasFilters} onClearFilters={clearFilters} />
          )}
        </div>
      </DndContext>
      {panelOpen && <NoDatePanel posts={filteredUndated} hasFilters={hasFilters} onClose={() => setPanelOpen(false)} />}
      </div>
      </ZoneContext.Provider>
      )}
    </>
  );
}

export function NoDatePanel({ posts, hasFilters, onClose }: { posts: P[]; hasFilters: boolean; onClose: () => void }) {
  return (
    <aside aria-label="Posts without a date" className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[var(--text)]">No date</p>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-6 w-6 place-items-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]">
          <X size={14} />
        </button>
      </div>
      {posts.length === 0 ? (
        <div className="px-2 py-8 text-center">
          <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--bg-sunken)] text-[var(--text-subtle)]"><FileText size={18} /></span>
          <p className="text-[13px] font-medium text-[var(--text)]">{hasFilters ? "Nothing matches these filters" : "No drafts without a date"}</p>
          <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">Drafts and approvals without a scheduled date will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/composer/${p.id}`} className="block rounded-[var(--radius-md)] border border-[var(--border)] p-2 hover:border-[var(--primary)]">
                <p className="truncate text-[13px] text-[var(--text)]">{p.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex -space-x-1">
                    {p.platforms.slice(0, 4).map((pl, i) => (
                      <PlatformBadge key={i} platform={pl} size={14} />
                    ))}
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function DayCell({
  date, posts, muted, canEdit, framed = true, maxVisible = 3, onOpenDay,
}: {
  date: Date;
  posts: P[];
  muted?: boolean;
  canEdit: boolean;
  /** false when the parent frame already draws the cell border (week view). */
  framed?: boolean;
  /** How many posts a cell lists before "+N more" (opens the day). */
  maxVisible?: number;
  onOpenDay?: (date: Date) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ymd(date) });
  const { todayKey } = React.useContext(ZoneContext);
  const isToday = ymd(date) === todayKey;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[64px] p-1 sm:min-h-[112px] sm:p-1.5",
        framed && "border-b border-r border-[var(--border)]",
        muted && "bg-[var(--bg-sunken)]/40",
        isOver && "bg-[var(--primary-soft)]/40",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className={cn("text-[12px] font-medium", isToday ? "flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-text)]" : "text-[var(--text-subtle)]")}>
          {date.getDate()}
        </span>
        {canEdit && (
          <Link href="/composer/new" aria-label="New post" className="hidden text-[var(--text-subtle)] hover:text-[var(--primary)] group-hover:opacity-100 sm:block sm:opacity-0">
            <Plus size={12} />
          </Link>
        )}
      </div>
      {/* Mobile shows at most 2 chips + an overflow count — 45px columns
          can't fit full chips, and the list view is one tap away for the rest. */}
      <div className="space-y-1">
        {posts.slice(0, Math.max(2, maxVisible)).map((p, i) => (
          <div key={p.id} className={i >= 2 ? "hidden sm:block" : undefined}>
            <PostChip post={p} canEdit={canEdit} compact={i < 2} />
          </div>
        ))}
        {posts.length > 2 && (
          <button type="button" onClick={() => onOpenDay?.(date)} className="block w-full truncate text-left text-[11px] font-medium text-[var(--text-subtle)] hover:text-[var(--primary)] sm:hidden">
            +{posts.length - 2} more
          </button>
        )}
        {posts.length > maxVisible && (
          <button type="button" onClick={() => onOpenDay?.(date)} className="hidden w-full truncate rounded-[var(--radius-sm)] px-1.5 py-0.5 text-left text-[11.5px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] sm:block">
            +{posts.length - maxVisible} more
          </button>
        )}
      </div>
    </div>
  );
}

function PostChip({ post, canEdit, compact }: { post: P; canEdit: boolean; compact?: boolean }) {
  const { tz } = React.useContext(ZoneContext);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id, disabled: !canEdit });
  const tone =
    post.status === "published" ? "border-l-[var(--success)]" :
    post.status === "failed" ? "border-l-[var(--danger)]" :
    post.status === "awaiting_approval" ? "border-l-[var(--warning)]" :
    "border-l-[var(--primary)]";
  const dot =
    post.status === "published" ? "bg-[var(--success)]" :
    post.status === "failed" ? "bg-[var(--danger)]" :
    post.status === "awaiting_approval" ? "bg-[var(--warning)]" :
    "bg-[var(--primary)]";
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, zIndex: 50 } : undefined}
      className={cn("rounded-[var(--radius-sm)] border border-[var(--border)] border-l-2 bg-[var(--surface)] px-1.5 py-1", tone, isDragging && "opacity-50 shadow-lg")}
      {...(canEdit ? { ...listeners, ...attributes } : {})}
    >
      <Link href={`/composer/${post.id}`} className="block">
        {/* Compact (mobile month cells): status dot + title only. The full
            time/platform row returns at sm+ via responsive display classes,
            so one chip serves both presentations. */}
        <div className="flex items-center gap-1">
          {compact && <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full sm:hidden", dot)} />}
          <span className="hidden text-[11px] font-semibold tabular-nums text-[var(--text)] sm:inline">{formatTimeIn(post.when, tz)}</span>
          <div className="hidden -space-x-1 sm:flex">
            {post.platforms.slice(0, 3).map((pl, i) => (
              <PlatformBadge key={i} platform={pl} size={12} />
            ))}
          </div>
          {post.status === "failed" && (
            <span className="ml-auto hidden rounded bg-[var(--danger-soft)] px-1 text-[10px] font-medium text-[var(--danger)] sm:inline">Failed</span>
          )}
        </div>
        <p className="truncate text-[12px] text-[var(--text-muted)]">{post.title}</p>
      </Link>
    </div>
  );
}

function MonthGrid({ cursor, byDay, canEdit, onOpenDay }: { cursor: Date; byDay: Map<string, P[]>; canEdit: boolean; onOpenDay: (d: Date) => void }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return (
    // Mobile: 7 columns can't fit at a legible width, so the grid scrolls
    // horizontally instead of clipping days 5-7 unreachably off-screen
    // (overflow-hidden did that before — WeekGrid above already avoids the
    // same trap by stacking vertically; Month can't stack the same way
    // without losing the at-a-glance grid, so it scrolls instead).
    <div className="mps-scroll-x rounded-[var(--radius-lg)] border-l border-t border-[var(--border)] sm:overflow-visible">
      <div className="min-w-[640px] sm:min-w-0">
        <div className="grid grid-cols-7 border-b border-r border-[var(--border)] bg-[var(--bg-sunken)]">
          {DOW.map((d) => (
            <div key={d} className="border-r border-[var(--border)] p-1 text-center text-[11px] font-semibold text-[var(--text-subtle)] last:border-r-0 sm:p-1.5 sm:text-[12px]">
              <span className="sm:hidden">{d.slice(0, 1)}</span>
              <span className="hidden sm:inline lg:hidden">{d}</span>
              <span className="hidden lg:inline">{DOW_LONG[DOW.indexOf(d)]}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => (
            <DayCell key={i} date={d} posts={byDay.get(ymd(d)) ?? []} muted={d.getMonth() !== cursor.getMonth()} canEdit={canEdit} onOpenDay={onOpenDay} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekGrid({ cursor, byDay, canEdit, onOpenDay }: { cursor: Date; byDay: Map<string, P[]>; canEdit: boolean; onOpenDay: (d: Date) => void }) {
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - cursor.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return (
    /* Mobile: the 7 days stack vertically (agenda-like) instead of crushing
       into ~45px columns. sm+ restores the 7-column week grid. */
    <div className="group grid grid-cols-1 gap-2 sm:gap-0 sm:grid-cols-7 sm:overflow-hidden sm:rounded-[var(--radius-lg)] sm:border-l sm:border-t sm:border-[var(--border)]">
      {days.map((d, i) => (
        <div key={i} className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] sm:rounded-none sm:border-0 sm:border-b sm:border-r">
          <div className="border-b border-[var(--border)] bg-[var(--bg-sunken)] p-1.5 text-[12px] font-semibold text-[var(--text-subtle)] sm:text-center">
            {DOW[d.getDay()]} {d.getDate()}
          </div>
          <DayCell date={d} posts={byDay.get(ymd(d)) ?? []} canEdit={canEdit} framed={false} maxVisible={50} onOpenDay={onOpenDay} />
        </div>
      ))}
    </div>
  );
}

function DayList({ cursor, posts }: { cursor: Date; posts: P[] }) {
  const { tz } = React.useContext(ZoneContext);
  const { setNodeRef, isOver } = useDroppable({ id: ymd(cursor) });
  return (
    <div ref={setNodeRef} className={cn("rounded-[var(--radius-lg)] border border-[var(--border)] p-4", isOver && "bg-[var(--primary-soft)]/30")}>
      {posts.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">Nothing scheduled for this day.</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/composer/${p.id}`} className="flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 hover:border-[var(--primary)]">
                <span className="shrink-0 text-[13px] font-medium tabular-nums text-[var(--text-muted)]">{formatTimeIn(p.when, tz)}</span>
                <div className="flex shrink-0 -space-x-1">
                  {p.platforms.map((pl, i) => (
                    <PlatformBadge key={i} platform={pl} size={16} />
                  ))}
                </div>
                <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--text)]">{p.title}</span>
                <StatusBadge status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListView({
  posts,
  canEdit,
  hasFilters,
  onClearFilters,
}: {
  posts: P[];
  canEdit: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  const { tz } = React.useContext(ZoneContext);
  const sorted = [...posts].sort((a, b) => +new Date(a.when) - +new Date(b.when));
  const router = useRouter();
  const { toast } = useToast();
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSel = sorted.length > 0 && sorted.every((p) => sel.has(p.id));

  async function bulk(op: "delete" | "duplicate" | "unschedule") {
    const ids = [...sel];
    if (
      op === "delete" &&
      !(await confirmDestructive({
        title: `Delete ${ids.length} post${ids.length === 1 ? "" : "s"}?`,
        body: `The selected post${ids.length === 1 ? "" : "s"} and ${
          ids.length === 1 ? "its" : "their"
        } schedule will be removed from every connected channel.`,
        confirmLabel: "Delete posts",
        irreversibleNote: "This can't be undone.",
      }))
    )
      return;
    setBusy(op);
    const fn =
      op === "delete" ? bulkDeletePostsAction : op === "duplicate" ? bulkDuplicatePostsAction : bulkUnschedulePostsAction;
    const res = await fn(ids);
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Done" : res.error ?? "Failed", tone: res.ok ? "success" : "error" });
    if (res.ok) {
      setSel(new Set());
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      {canEdit && sorted.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px]">
          <Checkbox
            className="text-[13px] text-[var(--text-muted)]"
            checked={allSel}
            onCheckedChange={(v) => setSel(v ? new Set(sorted.map((p) => p.id)) : new Set())}
            label={sel.size > 0 ? `${sel.size} selected` : "Select"}
          />
          {sel.size > 0 && (
            <div className="ml-auto flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" loading={busy === "duplicate"} onClick={() => bulk("duplicate")}>Duplicate</Button>
              <Button size="sm" variant="ghost" loading={busy === "unschedule"} onClick={() => bulk("unschedule")}>Unschedule</Button>
              <Button size="sm" variant="ghost" loading={busy === "delete"} onClick={() => bulk("delete")}>Delete</Button>
            </div>
          )}
        </div>
      )}
      {sorted.length === 0 &&
        (hasFilters ? (
          <InlineEmpty
            title="No posts match these filters"
            hint="Nothing in this view matches the channel, status, campaign or pillar you selected."
            action={
              <Button size="sm" variant="secondary" onClick={onClearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <InlineEmpty
            title="Nothing scheduled in this range"
            hint="Posts you schedule will appear here on their publish date. Move between weeks or months with the arrows above."
            tip="A post a day keeps the streak alive — start with today."
            mascot
          />
        ))}
      {sorted.map((p) => (
        <div key={p.id} className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5 sm:items-center sm:gap-3">
          {canEdit && (
            <Checkbox checked={sel.has(p.id)} onCheckedChange={() => toggle(p.id)} aria-label={`Select ${p.title}`} />
          )}
          <Link href={`/composer/${p.id}`} className="flex min-w-0 flex-1 flex-col gap-1 hover:text-[var(--primary)] sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 text-[12px] tabular-nums text-[var(--text-muted)] sm:w-32 sm:text-[13px]">
              {formatShortDateIn(p.when, tz)} · {formatTimeIn(p.when, tz)}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="flex shrink-0 -space-x-1">
                {p.platforms.map((pl, i) => (
                  <PlatformBadge key={i} platform={pl} size={16} />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--text)]">{p.title}</span>
            </span>
          </Link>
          <StatusBadge status={p.status} />
        </div>
      ))}
    </div>
  );
}
