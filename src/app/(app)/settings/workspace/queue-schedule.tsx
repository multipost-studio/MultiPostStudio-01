"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { PlatformBadge } from "@/components/brand";
import { useToast } from "@/components/ui/toast";
import { updateQueueSlotsAction } from "@/app/actions/workspace";
import { applySuggestedTimesAction } from "@/app/actions/posting-times";
import { POSTING_RESEARCH, POSTS_PER_WEEK } from "@/lib/posting-times";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Slot = { weekday: number; hour: number; minute: number };

export function QueueScheduleEditor({
  channels,
  canEdit,
}: {
  channels: { id: string; name: string; platform: string; slots: Slot[] }[];
  canEdit: boolean;
}) {
  if (channels.length === 0) {
    return <p className="text-[14px] text-[var(--text-muted)]">Connect a channel to set its posting schedule.</p>;
  }
  return (
    <div className="space-y-5">
      {channels.map((c) => (
        <ChannelSlots key={c.id} channel={c} canEdit={canEdit} />
      ))}
    </div>
  );
}

function ChannelSlots({
  channel,
  canEdit,
}: {
  channel: { id: string; name: string; platform: string; slots: Slot[] };
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [slots, setSlots] = React.useState<Slot[]>(
    [...channel.slots].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour),
  );
  const [dirty, setDirty] = React.useState(false);
  useUnsavedChanges(dirty);
  const [pending, setPending] = React.useState(false);
  const [perWeek, setPerWeek] = React.useState<(typeof POSTS_PER_WEEK)[number]>(3);
  const [suggesting, setSuggesting] = React.useState(false);

  async function useSuggested() {
    if (slots.length > 0 && !window.confirm(`Replace ${channel.name}'s ${slots.length} posting times with suggested ones?`)) return;
    setSuggesting(true);
    const res = await applySuggestedTimesAction(channel.id, perWeek, true);
    setSuggesting(false);
    toast({ title: res.ok ? res.message ?? "Posting times set" : "Couldn't set posting times", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <PlatformBadge platform={channel.platform} size={18} />
        <span className="text-[14px] font-medium text-[var(--text)]">{channel.name}</span>
        <span className="text-[12px] text-[var(--text-subtle)]">{slots.length} slots/week</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {slots.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-sunken)] px-2 py-1 text-[12px] text-[var(--text-muted)]">
            {DOW[s.weekday]} {String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")}
            {canEdit && (
              <button
                onClick={() => { setSlots((p) => p.filter((_, j) => j !== i)); setDirty(true); }}
                aria-label="Remove slot"
                className="rounded-full p-1 hover:text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              >
                <X size={11} />
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AddSlot
            onAdd={(s) => {
              setSlots((p) => [...p, s].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour));
              setDirty(true);
            }}
          />
          <span className="ml-auto flex items-center gap-1.5">
            <Select aria-label="Posts per week" value={perWeek} onChange={(e) => setPerWeek(Number(e.target.value) as (typeof POSTS_PER_WEEK)[number])} size="sm" className="w-auto" disabled={dirty}>
              {POSTS_PER_WEEK.map((n) => (
                <option key={n} value={n}>{n} a week</option>
              ))}
            </Select>
            <Button size="sm" variant="ghost" loading={suggesting} disabled={dirty} onClick={useSuggested} title={`From ${POSTING_RESEARCH.source} "${POSTING_RESEARCH.title}" (${POSTING_RESEARCH.updated}), in your profile time zone`}>
              Use suggested times
            </Button>
          </span>
          {dirty && (
            <Button
              size="sm"
              loading={pending}
              onClick={async () => {
                setPending(true);
                const res = await updateQueueSlotsAction(channel.id, slots);
                setPending(false);
                toast({ title: res.ok ? res.message ?? "Saved" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
                if (res.ok) { setDirty(false); router.refresh(); }
              }}
            >
              Save schedule
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function AddSlot({ onAdd }: { onAdd: (s: Slot) => void }) {
  const [wd, setWd] = React.useState(1);
  const [hr, setHr] = React.useState(9);
  return (
    <div className="flex items-center gap-1.5">
      <Select aria-label="Day of week" value={wd} onChange={(e) => setWd(Number(e.target.value))} size="sm" className="w-auto">
        {DOW.map((d, i) => (
          <option key={d} value={i}>{d}</option>
        ))}
      </Select>
      <Select aria-label="Hour" value={hr} onChange={(e) => setHr(Number(e.target.value))} size="sm" className="w-auto">
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
        ))}
      </Select>
      <Button size="sm" variant="secondary" onClick={() => onAdd({ weekday: wd, hour: hr, minute: 0 })}>
        <Plus size={13} /> Add slot
      </Button>
    </div>
  );
}
