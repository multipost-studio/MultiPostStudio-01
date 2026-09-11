"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Image as ImageIcon, Clock } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { reorderGridAction } from "@/app/actions/grid";

type Cell = { id: string; title: string | null; thumbUrl: string | null };

function Tile({ cell, draggable, badge }: { cell: Cell; draggable: boolean; badge?: React.ReactNode }) {
  const sortable = useSortable({ id: cell.id, disabled: !draggable });
  const style = draggable
    ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
    : undefined;

  return (
    <div
      ref={draggable ? sortable.setNodeRef : undefined}
      style={style}
      className="group relative aspect-square overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-sunken)]"
    >
      <Link href={`/composer/${cell.id}`} className="absolute inset-0">
        {cell.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cell.thumbUrl} alt={cell.title ?? ""} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-subtle)]">
            <ImageIcon size={20} />
          </div>
        )}
      </Link>
      {badge}
      {draggable && (
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label="Drag to reorder"
          className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-black/50 text-white opacity-0 group-hover:opacity-100"
        >
          <GripVertical size={13} />
        </button>
      )}
    </div>
  );
}

export function GridPlanner({
  canEdit,
  scheduled: initialScheduled,
  published,
}: {
  canEdit: boolean;
  scheduled: Cell[];
  published: Cell[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [scheduled, setScheduled] = React.useState(initialScheduled);
  const [saving, setSaving] = React.useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = scheduled.findIndex((c) => c.id === e.active.id);
    const to = scheduled.findIndex((c) => c.id === e.over!.id);
    if (from === -1 || to === -1) return;
    const next = arrayMove(scheduled, from, to);
    setScheduled(next);
    setSaving(true);
    const res = await reorderGridAction(next.map((c) => c.id));
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Couldn't reorder", description: res.error, tone: "error" });
      setScheduled(initialScheduled);
    } else {
      router.refresh();
    }
  }

  if (scheduled.length === 0 && published.length === 0) {
    return <p className="py-10 text-center text-[14px] text-[var(--text-muted)]">No Instagram posts yet — scheduled or published.</p>;
  }

  return (
    <div>
      {saving && <p className="mb-2 text-[12.5px] text-[var(--text-subtle)]">Saving new order…</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={scheduled.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-1.5">
            {scheduled.map((c) => (
              <Tile
                key={c.id}
                cell={c}
                draggable={canEdit}
                badge={
                  <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    <Clock size={9} /> Scheduled
                  </span>
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {published.length > 0 && (
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {published.map((c) => (
            <Tile key={c.id} cell={c} draggable={false} />
          ))}
        </div>
      )}
    </div>
  );
}
