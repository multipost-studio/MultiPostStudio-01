"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronUp, GripVertical, Loader2, RotateCcw, SlidersHorizontal, TriangleAlert } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm";
import { DASHBOARD_WIDGETS, moveWidget, reorderWidget, type DashboardLayout, type WidgetId, type WidgetZone } from "@/lib/ui-prefs";
import { cn } from "@/lib/utils";
import { useDashboardPrefs, type SaveState } from "./dashboard-layout";

const ZONES: { zone: WidgetZone; title: string }[] = [
  { zone: "top", title: "Top" },
  { zone: "main", title: "Main column" },
  { zone: "rail", title: "Side column" },
];

const LAYOUTS: { value: DashboardLayout; label: string; hint: string }[] = [
  { value: "split", label: "Two columns", hint: "Main content with a side column" },
  { value: "stacked", label: "Single column", hint: "Everything in one stack, best on small screens" },
];

export function CustomizeDashboard() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal size={14} aria-hidden /> Customize
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
          <CustomizePanel />
        </SheetContent>
      </Sheet>
    </>
  );
}

function CustomizePanel() {
  const { dashboard, sidebar, navGroups, saveState, setDashboard, setSidebar, resetAll, retrySave } = useDashboardPrefs();
  const confirm = useConfirm();

  const toggleWidget = (id: WidgetId, visible: boolean) =>
    setDashboard({ ...dashboard, hidden: visible ? dashboard.hidden.filter((h) => h !== id) : [...dashboard.hidden, id] });

  const toggleGroup = (title: string, visible: boolean) =>
    setSidebar({ ...sidebar, hiddenGroups: visible ? sidebar.hiddenGroups.filter((g) => g !== title) : [...sidebar.hiddenGroups, title] });

  async function reset() {
    const yes = await confirm({
      title: "Reset to default layout?",
      body: "Widget order and visibility, the layout, hidden sidebar sections and promo cards all go back to the defaults.",
      confirmLabel: "Reset dashboard",
      destructive: false,
    });
    if (yes) resetAll();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b border-[var(--border)] p-5 pr-12">
        <SheetTitle>Customize your dashboard</SheetTitle>
        <SheetDescription>Changes apply instantly and are saved to your account.</SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-7 overflow-y-auto p-5">
        <section aria-labelledby="cz-layout">
          <h3 id="cz-layout" className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Layout
          </h3>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Dashboard layout">
            {LAYOUTS.map((l) => (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={dashboard.layout === l.value}
                onClick={() => setDashboard({ ...dashboard, layout: l.value })}
                className={cn(
                  "rounded-[var(--radius-md)] border p-3 text-left transition-colors",
                  dashboard.layout === l.value ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:bg-[var(--surface-hover)]",
                )}
              >
                <LayoutGlyph kind={l.value} active={dashboard.layout === l.value} />
                <span className="mt-2 block text-[13.5px] font-medium text-[var(--text)]">{l.label}</span>
                <span className="block text-[12px] leading-snug text-[var(--text-muted)]">{l.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="cz-widgets">
          <h3 id="cz-widgets" className="text-[13px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Widgets
          </h3>
          <p className="mb-2 mt-1 text-[12.5px] text-[var(--text-muted)]">Drag the handle, or use the arrows, to reorder. Widgets stay in their column.</p>
          <div className="space-y-4">
            {ZONES.map(({ zone, title }) => {
              const ids = dashboard.order.filter((id) => DASHBOARD_WIDGETS.find((w) => w.id === id)?.zone === zone);
              if (ids.length === 0) return null;
              return (
                <WidgetGroup
                  key={zone}
                  title={title}
                  showTitle={ids.length > 1 || zone !== "top"}
                  ids={ids}
                  hidden={dashboard.hidden}
                  onToggle={toggleWidget}
                  onReorder={(id, overId) => setDashboard({ ...dashboard, order: reorderWidget(dashboard.order, id, overId) })}
                  onMove={(id, dir) => setDashboard({ ...dashboard, order: moveWidget(dashboard.order, id, dir) })}
                />
              );
            })}
          </div>
        </section>

        <section aria-labelledby="cz-sidebar">
          <h3 id="cz-sidebar" className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Sidebar
          </h3>
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
            <li className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span>
                <span className="block text-[14px] text-[var(--text)]">Promotions and announcements</span>
                <span className="block text-[12px] text-[var(--text-muted)]">Offers and product news in the sidebar and on the dashboard</span>
              </span>
              <Switch checked={sidebar.showPromos} onCheckedChange={(v) => setSidebar({ ...sidebar, showPromos: v })} srLabel="Show promotions in the sidebar" />
            </li>
            {navGroups.map((g) => (
              <li key={g} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[14px] text-[var(--text)]">{g} section</span>
                <Switch checked={!sidebar.hiddenGroups.includes(g)} onCheckedChange={(v) => toggleGroup(g, v)} srLabel={`Show the ${g} section in the sidebar`} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[var(--border)] p-4">
        <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={() => void reset()}>
          <RotateCcw size={14} aria-hidden /> Reset dashboard
        </Button>
        <SaveIndicator state={saveState} onRetry={retrySave} />
      </footer>
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <span role="status" aria-live="polite" className="flex min-h-5 items-center gap-1.5 text-[13px]">
      {state === "saving" && (
        <>
          <Loader2 size={13} className="animate-spin text-[var(--text-subtle)]" aria-hidden />
          <span className="text-[var(--text-muted)]">Saving…</span>
        </>
      )}
      {state === "saved" && (
        <>
          <Check size={13} className="text-[var(--success)]" aria-hidden />
          <span className="text-[var(--text-muted)]">Saved</span>
        </>
      )}
      {state === "error" && (
        <>
          <TriangleAlert size={13} className="text-[var(--danger)]" aria-hidden />
          <span className="text-[var(--danger)]">Couldn&apos;t save.</span>
          <button type="button" onClick={onRetry} className="font-medium text-[var(--primary)] underline-offset-2 hover:underline">
            Retry
          </button>
        </>
      )}
    </span>
  );
}

function LayoutGlyph({ kind, active }: { kind: DashboardLayout; active: boolean }) {
  const bar = active ? "bg-[var(--primary)]/60" : "bg-[var(--border-strong)]";
  return kind === "split" ? (
    <span aria-hidden className="grid h-8 grid-cols-3 gap-1">
      <span className={cn("col-span-2 rounded-sm", bar)} />
      <span className={cn("rounded-sm", bar)} />
    </span>
  ) : (
    <span aria-hidden className="grid h-8 grid-rows-3 gap-1">
      <span className={cn("rounded-sm", bar)} />
      <span className={cn("rounded-sm", bar)} />
      <span className={cn("rounded-sm", bar)} />
    </span>
  );
}

function WidgetGroup({
  title,
  showTitle,
  ids,
  hidden,
  onToggle,
  onReorder,
  onMove,
}: {
  title: string;
  showTitle: boolean;
  ids: WidgetId[];
  hidden: WidgetId[];
  onToggle: (id: WidgetId, visible: boolean) => void;
  onReorder: (id: WidgetId, overId: WidgetId) => void;
  onMove: (id: WidgetId, dir: -1 | 1) => void;
}) {
  const sensors = useSensors(
    // A small distance keeps taps on the switch/arrows from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) onReorder(e.active.id as WidgetId, e.over.id as WidgetId);
  };

  return (
    <div>
      {showTitle && <p className="mb-1.5 text-[12px] font-medium text-[var(--text-subtle)]">{title}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {ids.map((id, i) => (
              <WidgetRow
                key={id}
                id={id}
                visible={!hidden.includes(id)}
                first={i === 0}
                last={i === ids.length - 1}
                onToggle={onToggle}
                onMove={onMove}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function WidgetRow({
  id,
  visible,
  first,
  last,
  onToggle,
  onMove,
}: {
  id: WidgetId;
  visible: boolean;
  first: boolean;
  last: boolean;
  onToggle: (id: WidgetId, visible: boolean) => void;
  onMove: (id: WidgetId, dir: -1 | 1) => void;
}) {
  const w = DASHBOARD_WIDGETS.find((x) => x.id === id)!;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1.5 rounded-[var(--radius-md)] border bg-[var(--surface)] py-1.5 pl-1 pr-2.5",
        isDragging ? "relative z-10 border-[var(--primary)] shadow-md" : "border-[var(--border)]",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${w.label}`}
        className="flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] active:cursor-grabbing"
      >
        <GripVertical size={15} aria-hidden />
      </button>
      <div className={cn("min-w-0 flex-1 transition-opacity", !visible && "opacity-50")}>
        <p className="truncate text-[13.5px] font-medium text-[var(--text)]">{w.label}</p>
        <p className="truncate text-[12px] text-[var(--text-muted)]">{w.description}</p>
      </div>
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={() => onMove(id, -1)}
          disabled={first}
          aria-label={`Move ${w.label} up`}
          className="rounded-sm p-0.5 text-[var(--text-subtle)] hover:text-[var(--text)] disabled:opacity-25"
        >
          <ChevronUp size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onMove(id, 1)}
          disabled={last}
          aria-label={`Move ${w.label} down`}
          className="rounded-sm p-0.5 text-[var(--text-subtle)] hover:text-[var(--text)] disabled:opacity-25"
        >
          <ChevronDown size={14} aria-hidden />
        </button>
      </div>
      <Switch checked={visible} onCheckedChange={(v) => onToggle(id, v)} srLabel={`Show ${w.label}`} />
    </li>
  );
}
