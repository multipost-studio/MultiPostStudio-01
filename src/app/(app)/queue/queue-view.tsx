"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pause, Play, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatTime } from "@/lib/utils";
import { toggleChannelQueueAction, retryPublishAction, unscheduleAction } from "@/app/actions/posts";

type Ch = { id: string; name: string; platform: string; paused: boolean; slotCount: number };
type Sched = { id: string; title: string; when: string; status: string; channelIds: string[]; platforms: string[] };

export function QueueView({
  channels,
  scheduled,
  failed,
  recommendation,
  canEdit,
}: {
  channels: Ch[];
  scheduled: Sched[];
  failed: { id: string; title: string; error: string }[];
  recommendation: { note: string; bestHour: number };
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [active, setActive] = React.useState<string>("all");

  const list = active === "all" ? scheduled : scheduled.filter((s) => s.channelIds.includes(active));

  // group by date
  const groups = React.useMemo(() => {
    const m = new Map<string, Sched[]>();
    for (const s of list) {
      const k = new Date(s.when).toDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return [...m.entries()];
  }, [list]);

  return (
    <>
      <PageHeader
        title="Queue"
        description="Everything scheduled, grouped by day. Pause a channel to hold its publishing."
      />

      <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--primary-soft)]/40 p-3">
        <p className="flex items-center gap-1.5 text-[14px] text-[var(--text)]">
          <Sparkles size={14} className="text-[var(--primary)]" />
          <span className="font-medium">AI scheduling:</span> {recommendation.note}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setActive("all")}
          className={`rounded-full border px-2.5 py-1 text-[13px] font-medium ${active === "all" ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}
        >
          All channels
        </button>
        {channels.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium ${active === c.id ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}
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
                  <div key={f.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--danger-soft)] p-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/composer/${f.id}`} className="truncate text-[14px] font-medium text-[var(--text)] hover:underline">
                        {f.title}
                      </Link>
                      <p className="text-[12px] text-[var(--danger)]">{f.error}</p>
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

          {groups.length === 0 ? (
            <EmptyState
              title="Queue is empty"
              description="Schedule a post or add drafts to the queue to fill your slots."
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
                  {formatDate(new Date(day), { weekday: "long", month: "short", day: "numeric" })}
                </p>
                <div className="space-y-2">
                  {items.map((s) => (
                    <Card key={s.id} className="flex items-center gap-3 p-3">
                      <span className="w-14 shrink-0 text-[14px] font-medium tabular-nums text-[var(--text-muted)]">
                        {formatTime(s.when)}
                      </span>
                      <div className="flex -space-x-1">
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
                            await unscheduleAction(s.id);
                            toast({ title: "Moved to drafts", tone: "success" });
                            router.refresh();
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </Card>
                  ))}
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
