"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pause, Play, Plus, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import { useCalendarTimeZone } from "@/lib/use-calendar-timezone";
import { TimeZonePicker } from "@/components/time-zone-picker";
import { dayKeyIn, formatShortDateIn, formatTimeIn } from "@/lib/tz-math";
import { ALL_EMPTY_CHANNELS } from "@/lib/posting-times";
import { upcomingOpenSlots, type SlotRow } from "@/lib/queue-slots";
import { isValidTimezone } from "@/lib/timezones";
import { QueueWelcome } from "./queue-welcome";
import { toggleChannelQueueAction, retryPublishAction, unscheduleAction } from "@/app/actions/posts";

type Ch = { id: string; name: string; platform: string; paused: boolean; slotCount: number };
type Sched = { id: string; title: string; when: string; status: string; channelIds: string[]; platforms: string[] };

/** "2026-10-2" (year, month 0 to 11, day) as a plain local date, for the day heading. */
function floatingDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m, d);
}

/** A free place in the queue: one of a channel's posting times that nothing is scheduled in. Tapping it starts a post for that channel and time. */
function OpenSlotRow({ channel, at, tz, canEdit, showName }: { channel: { id: string; name: string; platform: string }; at: string; tz: string; canEdit: boolean; showName: boolean }) {
  const inner = (
    <>
      <span className="w-14 shrink-0 text-[14px] font-medium tabular-nums text-[var(--text-muted)]">{formatTimeIn(at, tz)}</span>
      <PlatformBadge platform={channel.platform} size={18} />
      {showName && <span className="hidden min-w-0 max-w-[40%] truncate text-[13px] text-[var(--text-subtle)] sm:inline">{channel.name}</span>}
      {canEdit && (
        <span className="inline-flex items-center gap-1 text-[14px] text-[var(--text-muted)]">
          <Plus size={14} aria-hidden="true" /> New
        </span>
      )}
    </>
  );
  const cls = "flex items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-3 py-2.5";
  return canEdit ? (
    <Link href={`/composer/new?channel=${encodeURIComponent(channel.id)}&at=${encodeURIComponent(at)}`} aria-label={`New post for ${channel.name} at ${formatTimeIn(at, tz)}`} className={`${cls} transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-hover)]`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function QueueView({
  channels,
  scheduled,
  failed,
  recommendation,
  canEdit,
  schedulerStale,
  schedulerLastRun,
  profileTimezone,
  workspaceTimezone,
  slots = [],
  initialChannel,
}: {
  /** Every channel's weekly posting times (wall-clock, in the profile time zone). */
  slots?: SlotRow[];
  /** Channel to start on, from a link in the sidebar. */
  initialChannel?: string | null;
  /** The person's own and the workspace's time zones, offered as suggestions in the time zone menu. */
  profileTimezone?: string | null;
  workspaceTimezone?: string | null;
  channels: Ch[];
  scheduled: Sched[];
  failed: { id: string; title: string; error: string }[];
  /** Measured from published results — bestHour is null until there is
   *  enough history to say anything. */
  recommendation: { note: string; bestHour: number | null; insufficient: boolean };
  canEdit: boolean;
  /** True when no worker/cron tick has run recently: scheduled posts are
   *  sitting still and the user must know instead of assuming a delay. */
  schedulerStale: boolean;
  schedulerLastRun: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [active, setActive] = React.useState<string>(initialChannel && channels.some((c) => c.id === initialChannel) ? initialChannel : "all");
  // Days and times are in the visitor's time zone, which the server can't know: show them once the page has loaded so the
  // server and browser HTML match (otherwise React reports "Hydration failed").
  const hydrated = useHydrated();
  // The same time zone choice as the Calendar (shared live): days and times below are shown in it.
  const { timeZone: tz, deviceZone, setTimeZone } = useCalendarTimeZone();

  const list = active === "all" ? scheduled : scheduled.filter((s) => s.channelIds.includes(active));

  // The schedule's own time zone: posting times are wall-clock in the profile zone, like "Add to queue" reads them.
  const slotTz = profileTimezone && isValidTimezone(profileTimezone) ? profileTimezone : "UTC";

  // Free places over the next two weeks (a channel's posting times that no scheduled post holds), for the channels in view.
  const openSlots = React.useMemo(() => {
    if (!hydrated) return [];
    const live = new Set(channels.filter((c) => !c.paused && (active === "all" || c.id === active)).map((c) => c.id));
    return upcomingOpenSlots({ slots: slots.filter((s) => live.has(s.channelId)), scheduled, slotTz, from: new Date(), days: 14 }).slice(0, 60);
  }, [hydrated, slots, channels, active, scheduled, slotTz]);

  // group by day (in the zone being shown): scheduled posts and free places, in time order
  type Entry = { kind: "post"; when: string; post: Sched } | { kind: "open"; when: string; channelId: string };
  const groups = React.useMemo(() => {
    const m = new Map<string, Entry[]>();
    const add = (when: string, e: Entry) => {
      const k = dayKeyIn(new Date(when), tz);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    };
    for (const s of list) add(s.when, { kind: "post", when: s.when, post: s });
    for (const o of openSlots) add(o.at, { kind: "open", when: o.at, channelId: o.channelId });
    for (const arr of m.values()) arr.sort((a, b) => a.when.localeCompare(b.when));
    return [...m.entries()].sort(([a], [b]) => {
      const [ay, am, ad] = a.split("-").map(Number);
      const [by, bm, bd] = b.split("-").map(Number);
      return Date.UTC(ay, am, ad) - Date.UTC(by, bm, bd);
    });
  }, [list, openSlots, tz]);

  // channels in view that have no posting times yet: the welcome card offers to set them
  const needTimes = channels.filter((c) => (active === "all" || c.id === active) && c.slotCount === 0);
  const deviceTz = deviceZone;

  return (
    <>
      <PageHeader
        title="Queue"
        description="Everything scheduled, grouped by day. Pause a channel to hold its publishing."
      />

      {hydrated && (
        <div className="mb-3 flex justify-end">
          <TimeZonePicker
            value={tz}
            onChange={setTimeZone}
            deviceZone={deviceZone}
            suggestions={[
              ...(profileTimezone ? ([[profileTimezone, "Your profile"]] as [string, string][]) : []),
              ...(workspaceTimezone ? ([[workspaceTimezone, "Workspace"]] as [string, string][]) : []),
            ]}
          />
        </div>
      )}

      {schedulerStale && scheduled.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-[13px] text-[var(--text)]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--warning)]" />
          <p>
            The publishing scheduler hasn&apos;t run
            {schedulerLastRun ? (
              hydrated ? <> since {formatShortDateIn(schedulerLastRun, tz)} {formatTimeIn(schedulerLastRun, tz)}</> : null
            ) : (
              " yet"
            )}
            , so scheduled posts are waiting. Self-hosted setups need the worker process running
            (<code>npm run worker</code>); Hobby deploys only tick the queue once a day — upgrade to Pro
            or run the worker for intraday publishing.
          </p>
        </div>
      )}

      {/* Measured from this workspace's own engagement, not generated — it was
          labelled "AI scheduling" while returning the same invented time to
          every workspace. */}
      <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--primary-soft)]/40 p-3">
        <p className="flex items-center gap-1.5 text-[14px] text-[var(--text)]">
          <Sparkles size={14} className="text-[var(--primary)]" />
          <span className="font-medium">
            {recommendation.insufficient ? "Best time to post:" : "Your best time to post:"}
          </span>{" "}
          {recommendation.note}
        </p>
      </div>

      {hydrated && needTimes.length > 0 && (
        <QueueWelcome channels={needTimes} target={active === "all" ? ALL_EMPTY_CHANNELS : active} profileTimezone={slotTz} deviceZone={deviceTz} canEdit={canEdit} />
      )}

      <div className="mps-scroll-x -mx-1 mb-4 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          onClick={() => setActive("all")}
          className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium ${active === "all" ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}
        >
          All channels
        </button>
        {channels.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${active === c.id ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            <PlatformBadge platform={c.platform} size={14} />
            {c.name}
            {c.paused && <Pause size={11} />}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {failed.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-[var(--danger)]">
                  <AlertTriangle size={15} /> Failed to publish ({failed.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {failed.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--danger-soft)] p-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/composer/${f.id}`} className="block truncate text-[14px] font-medium text-[var(--text)] hover:underline">
                        {f.title}
                      </Link>
                      <p className="break-words text-[12px] text-[var(--danger)]">{f.error}</p>
                    </div>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const res = await retryPublishAction(f.id);
                          toast({ title: res.ok ? "Retrying" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
                          router.refresh();
                        }}
                      >
                        <RefreshCw size={13} /> Retry
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!hydrated && list.length > 0 ? (
            <div aria-hidden="true" data-queue-placeholder className="h-40 animate-pulse rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-sunken)]/50" />
          ) : groups.length === 0 ? (
            <EmptyState
              title="Queue is empty"
              description="Schedule a post or add drafts to the queue to fill your slots."
              tip="Best-time slots fill fastest — schedule today's post before noon."
              action={
                <Button asChild size="sm">
                  <Link href="/composer/new">Create a post</Link>
                </Button>
              }
            />
          ) : (
            groups.map(([day, items]) => (
              <div key={day}>
                <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                  {formatDate(floatingDay(day), { weekday: "long", month: "short", day: "numeric" })}
                </p>
                <div className="space-y-2">
                  {items.map((entry) => {
                    if (entry.kind === "open") {
                      const ch = channels.find((c) => c.id === entry.channelId);
                      return ch ? <OpenSlotRow key={`open-${entry.channelId}-${entry.when}`} channel={ch} at={entry.when} tz={tz} canEdit={canEdit} showName={active === "all" && channels.length > 1} /> : null;
                    }
                    const s = entry.post;
                    return (
                    <Card key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                      <span className="w-14 shrink-0 text-[14px] font-medium tabular-nums text-[var(--text-muted)]">
                        {formatTimeIn(s.when, tz)}
                      </span>
                      <div className="flex shrink-0 -space-x-1">
                        {s.platforms.map((p, i) => (
                          <PlatformBadge key={i} platform={p} size={18} />
                        ))}
                      </div>
                      <Link href={`/composer/${s.id}`} className="min-w-0 flex-1 truncate text-[14px] text-[var(--text)] hover:underline">
                        {s.title}
                      </Link>
                      <StatusBadge status={s.status} />
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const { confirmDestructive } = await import("@/components/ui/confirm");
                            const ok = await confirmDestructive({
                              title: "Remove from queue?",
                              body: "The post moves back to drafts. Its schedule is cleared but content is kept.",
                              confirmLabel: "Remove from queue",
                            });
                            if (!ok) return;
                            await unscheduleAction(s.id);
                            toast({ title: "Moved to drafts", tone: "success" });
                            router.refresh();
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </Card>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Channel queues</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {channels.map((c) => (
                <div key={c.id} className="flex items-center gap-2.5">
                  <PlatformBadge platform={c.platform} size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-[var(--text)]">{c.name}</p>
                    <p className="text-[12px] text-[var(--text-subtle)]">{c.slotCount} weekly slots</p>
                  </div>
                  {c.paused ? (
                    <Badge tone="warning">Paused</Badge>
                  ) : (
                    <Badge tone="success" dot>
                      Active
                    </Badge>
                  )}
                  {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={c.paused ? "Resume" : "Pause"}
                      onClick={async () => {
                        await toggleChannelQueueAction(c.id, !c.paused);
                        router.refresh();
                      }}
                    >
                      {c.paused ? <Play size={14} /> : <Pause size={14} />}
                    </Button>
                  )}
                </div>
              ))}
              <Button asChild variant="secondary" size="sm" className="mt-2 w-full">
                <Link href="/settings/workspace">Edit posting schedule</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
