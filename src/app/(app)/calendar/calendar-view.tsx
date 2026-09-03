"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { confirmDestructive } from "@/components/ui/confirm";
import { Segmented } from "@/components/ui/controls";
import { Select } from "@/components/ui/input";
import { PlatformBadge } from "@/components/brand";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/ui/toast";
import { cn, formatTime } from "@/lib/utils";
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

const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function CalendarView({
  posts: initial,
  channels,
  campaigns,
  pillars,
  canEdit,
  bestTimes,
}: {
  posts: P[];
  channels: { id: string; name: string; platform: string }[];
  campaigns: { id: string; name: string; color: string }[];
  pillars: { id: string; name: string; color: string }[];
  canEdit: boolean;
  bestTimes?: { bestWeekday: number; bestHour: number; note: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [posts, setPosts] = React.useState(initial);
  const [view, setView] = React.useState<View>("month");
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [fChannel, setFChannel] = React.useState("");
  const [fStatus, setFStatus] = React.useState("");
  const [fCampaign, setFCampaign] = React.useState("");
  const [fPillar, setFPillar] = React.useState("");

  React.useEffect(() => setPosts(initial), [initial]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const filtered = posts.filter(
    (p) =>
      (!fChannel || p.channelIds.includes(fChannel)) &&
      (!fStatus || p.status === fStatus) &&
      (!fCampaign || p.campaignId === fCampaign) &&
      (!fPillar || p.pillarId === fPillar),
  );

  const byDay = React.useMemo(() => {
    const m = new Map<string, P[]>();
    for (const p of filtered) {
      const d = new Date(p.when);
      const k = ymd(d);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    for (const arr of m.values()) arr.sort((a, b) => +new Date(a.when) - +new Date(b.when));
    return m;
  }, [filtered]);

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const id = String(e.active.id);
    const [y, mo, da] = String(e.over.id).split("-").map(Number);
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    const old = new Date(post.when);
    const next = new Date(y, mo, da, old.getHours() || 9, old.getMinutes() || 0);
    if (ymd(old) === ymd(next)) return;
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
        description="Drag posts to reschedule. Filter by channel, status, campaign or pillar."
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { value: "month", label: "Month" },
            { value: "week", label: "Week" },
            { value: "day", label: "Day" },
            { value: "list", label: "List" },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label="Previous">
            <ChevronLeft size={16} />
          </Button>
          <span className="min-w-[160px] text-center text-[14px] font-semibold text-[var(--text)]">{label}</span>
          <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label="Next">
            <ChevronRight size={16} />
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setCursor(new Date(new Date().setHours(0, 0, 0, 0)))}>
          Today
        </Button>

        <div className="ml-auto flex flex-wrap gap-1.5">
          <Select value={fChannel} onChange={(e) => setFChannel(e.target.value)} className="h-8 w-auto text-[13px]">
            <option value="">All channels</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.platform}</option>
            ))}
          </Select>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="h-8 w-auto text-[13px]">
            <option value="">All statuses</option>
            {["scheduled", "approved", "awaiting_approval", "published", "failed"].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </Select>
          <Select value={fCampaign} onChange={(e) => setFCampaign(e.target.value)} className="h-8 w-auto text-[13px]">
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select value={fPillar} onChange={(e) => setFPillar(e.target.value)} className="h-8 w-auto text-[13px]">
            <option value="">All pillars</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {bestTimes && (
        <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary-soft)]/40 px-3 py-2 text-[13px] text-[var(--text-muted)]">
          <span className="font-medium text-[var(--primary)]">Best time to post:</span>
          <span>
            {DOW_LONG[bestTimes.bestWeekday]}s around {bestTimes.bestHour}:00
          </span>
          <span className="hidden text-[var(--text-subtle)] sm:inline">· {bestTimes.note}</span>
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {view === "month" && <MonthGrid cursor={cursor} byDay={byDay} canEdit={canEdit} />}
        {view === "week" && <WeekGrid cursor={cursor} byDay={byDay} canEdit={canEdit} />}
        {view === "day" && <DayList cursor={cursor} posts={byDay.get(ymd(cursor)) ?? []} />}
        {view === "list" && <ListView posts={filtered} canEdit={canEdit} />}
      </DndContext>
    </>
  );
}

function DayCell({
  date, posts, muted, canEdit,
}: {
  date: Date;
  posts: P[];
  muted?: boolean;
  canEdit: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ymd(date) });
  const isToday = ymd(date) === ymd(new Date());
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[112px] border-b border-r border-[var(--border)] p-1.5",
        muted && "bg-[var(--bg-sunken)]/40",
        isOver && "bg-[var(--primary-soft)]/40",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className={cn("text-[12px] font-medium", isToday ? "flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-white" : "text-[var(--text-subtle)]")}>
          {date.getDate()}
        </span>
        {canEdit && (
          <Link href="/composer/new" className="text-[var(--text-subtle)] opacity-0 hover:text-[var(--primary)] group-hover:opacity-100">
            <Plus size={12} />
          </Link>
        )}
      </div>
      <div className="space-y-1">
        {posts.map((p) => (
          <PostChip key={p.id} post={p} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function PostChip({ post, canEdit }: { post: P; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id, disabled: !canEdit });
  const tone =
    post.status === "published" ? "border-l-[var(--success)]" :
    post.status === "failed" ? "border-l-[var(--danger)]" :
    post.status === "awaiting_approval" ? "border-l-[var(--warning)]" :
    "border-l-[var(--primary)]";
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, zIndex: 50 } : undefined}
      className={cn("rounded-[var(--radius-sm)] border border-[var(--border)] border-l-2 bg-[var(--surface)] px-1.5 py-1", tone, isDragging && "opacity-50 shadow-lg")}
      {...(canEdit ? { ...listeners, ...attributes } : {})}
    >
      <Link href={`/composer/${post.id}`} className="block">
        <div className="flex items-center gap-1">
          <span className="text-[11px] tabular-nums text-[var(--text-subtle)]">{formatTime(post.when)}</span>
          <div className="flex -space-x-1">
            {post.platforms.slice(0, 3).map((pl, i) => (
              <PlatformBadge key={i} platform={pl} size={12} />
            ))}
          </div>
        </div>
        <p className="truncate text-[12px] text-[var(--text)]">{post.title}</p>
      </Link>
    </div>
  );
}

function MonthGrid({ cursor, byDay, canEdit }: { cursor: Date; byDay: Map<string, P[]>; canEdit: boolean }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return (
    <div className="group overflow-hidden rounded-[var(--radius-lg)] border-l border-t border-[var(--border)]">
      <div className="grid grid-cols-7 border-b border-r border-[var(--border)] bg-[var(--bg-sunken)]">
        {DOW.map((d) => (
          <div key={d} className="border-r border-[var(--border)] p-1.5 text-center text-[12px] font-semibold text-[var(--text-subtle)] last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => (
          <DayCell key={i} date={d} posts={byDay.get(ymd(d)) ?? []} muted={d.getMonth() !== cursor.getMonth()} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function WeekGrid({ cursor, byDay, canEdit }: { cursor: Date; byDay: Map<string, P[]>; canEdit: boolean }) {
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - cursor.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return (
    <div className="group grid grid-cols-7 overflow-hidden rounded-[var(--radius-lg)] border-l border-t border-[var(--border)]">
      {days.map((d, i) => (
        <div key={i}>
          <div className="border-b border-r border-[var(--border)] bg-[var(--bg-sunken)] p-1.5 text-center text-[12px] font-semibold text-[var(--text-subtle)]">
            {DOW[d.getDay()]} {d.getDate()}
          </div>
          <DayCell date={d} posts={byDay.get(ymd(d)) ?? []} canEdit={canEdit} />
        </div>
      ))}
    </div>
  );
}

function DayList({ cursor, posts }: { cursor: Date; posts: P[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: ymd(cursor) });
  return (
    <div ref={setNodeRef} className={cn("rounded-[var(--radius-lg)] border border-[var(--border)] p-4", isOver && "bg-[var(--primary-soft)]/30")}>
      {posts.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">Nothing scheduled for this day.</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/composer/${p.id}`} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 hover:border-[var(--primary)]">
                <span className="text-[13px] font-medium tabular-nums text-[var(--text-muted)]">{formatTime(p.when)}</span>
                <div className="flex -space-x-1">
                  {p.platforms.map((pl, i) => (
                    <PlatformBadge key={i} platform={pl} size={16} />
                  ))}
                </div>
                <span className="flex-1 truncate text-[14px] text-[var(--text)]">{p.title}</span>
                <StatusBadge status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListView({ posts, canEdit }: { posts: P[]; canEdit: boolean }) {
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
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px]">
          <label className="flex items-center gap-2 text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={allSel}
              onChange={(e) => setSel(e.target.checked ? new Set(sorted.map((p) => p.id)) : new Set())}
            />
            {sel.size > 0 ? `${sel.size} selected` : "Select"}
          </label>
          {sel.size > 0 && (
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant="ghost" loading={busy === "duplicate"} onClick={() => bulk("duplicate")}>Duplicate</Button>
              <Button size="sm" variant="ghost" loading={busy === "unschedule"} onClick={() => bulk("unschedule")}>Unschedule</Button>
              <Button size="sm" variant="ghost" loading={busy === "delete"} onClick={() => bulk("delete")}>Delete</Button>
            </div>
          )}
        </div>
      )}
      {sorted.length === 0 && <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">No posts match your filters.</p>}
      {sorted.map((p) => (
        <div key={p.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5">
          {canEdit && (
            <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.title}`} />
          )}
          <Link href={`/composer/${p.id}`} className="flex flex-1 items-center gap-3 hover:text-[var(--primary)]">
            <span className="w-32 shrink-0 text-[13px] tabular-nums text-[var(--text-muted)]">
              {new Date(p.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {formatTime(p.when)}
            </span>
            <div className="flex -space-x-1">
              {p.platforms.map((pl, i) => (
                <PlatformBadge key={i} platform={pl} size={16} />
              ))}
            </div>
            <span className="flex-1 truncate text-[14px] text-[var(--text)]">{p.title}</span>
          </Link>
          <StatusBadge status={p.status} />
        </div>
      ))}
    </div>
  );
}
