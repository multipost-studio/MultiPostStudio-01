"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { PlatformBadge } from "@/components/brand";
import { useToast } from "@/components/ui/toast";
import { updateQueueSlotsAction } from "@/app/actions/workspace";
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
      <Select value={wd} onChange={(e) => setWd(Number(e.target.value))} className="h-8 w-auto text-[13px]">
        {DOW.map((d, i) => (
          <option key={d} value={i}>{d}</option>
        ))}
      </Select>
      <Select value={hr} onChange={(e) => setHr(Number(e.target.value))} className="h-8 w-auto text-[13px]">
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
