"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  resetDashboardPrefsAction,
  saveDashboardPrefsAction,
  saveSidebarPrefsAction,
} from "@/app/actions/ui-prefs";
import {
  DEFAULT_DASHBOARD_PREFS,
  DEFAULT_SIDEBAR_PREFS,
  widgetsInZone,
  type DashboardPrefs,
  type SidebarPrefs,
  type WidgetId,
} from "@/lib/ui-prefs";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "error";

type Ctx = {
  dashboard: DashboardPrefs;
  sidebar: SidebarPrefs;
  navGroups: string[];
  saveState: SaveState;
  setDashboard: (next: DashboardPrefs) => void;
  setSidebar: (next: SidebarPrefs) => void;
  resetAll: () => void;
  /** Re-send changes that failed to save. */
  retrySave: () => void;
};

const DashboardPrefsContext = React.createContext<Ctx | null>(null);

export function useDashboardPrefs(): Ctx {
  const ctx = React.useContext(DashboardPrefsContext);
  if (!ctx) throw new Error("useDashboardPrefs must be used inside <DashboardLayoutProvider>");
  return ctx;
}

const SAVE_DEBOUNCE_MS = 600;

/**
 * Owns the user's dashboard + sidebar preferences on the client. Changes apply
 * instantly (optimistic) and are autosaved to the user's account after a short
 * debounce, so the same layout follows them across devices. A pending save is
 * flushed if the page is left.
 */
export function DashboardLayoutProvider({
  dashboard: initialDashboard,
  sidebar: initialSidebar,
  navGroups,
  children,
}: {
  dashboard: DashboardPrefs;
  sidebar: SidebarPrefs;
  navGroups: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [dashboard, setDashboardState] = React.useState(initialDashboard);
  const [sidebar, setSidebarState] = React.useState(initialSidebar);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  const pending = React.useRef<{ dashboard?: DashboardPrefs; sidebar?: SidebarPrefs }>({});
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = pending.current;
    pending.current = {};
    if (!batch.dashboard && !batch.sidebar) return;

    setSaveState("saving");
    // Sequential, not parallel: for a first-time user both writes upsert the
    // same UserPreference row, and two concurrent creates would collide.
    const dash = batch.dashboard ? await saveDashboardPrefsAction(batch.dashboard) : { ok: true as const };
    const side = batch.sidebar ? await saveSidebarPrefsAction(batch.sidebar) : { ok: true as const };
    const ok = dash.ok && side.ok;
    setSaveState(ok ? "saved" : "error");
    // Keep failed changes (newer edits win) so "Retry" can re-send them.
    if (!ok) pending.current = { ...batch, ...pending.current };
    if (ok && batch.sidebar) router.refresh(); // the sidebar itself is server-rendered
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    if (ok) fadeTimer.current = setTimeout(() => setSaveState("idle"), 2000);
  }, [router]);

  const schedule = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }, [flush]);

  React.useEffect(
    () => () => {
      if (timer.current) void flush();
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    },
    [flush],
  );

  const value = React.useMemo<Ctx>(
    () => ({
      dashboard,
      sidebar,
      navGroups,
      saveState,
      setDashboard: (next) => {
        setDashboardState(next);
        pending.current.dashboard = next;
        schedule();
      },
      setSidebar: (next) => {
        setSidebarState(next);
        pending.current.sidebar = next;
        schedule();
      },
      retrySave: () => void flush(),
      resetAll: () => {
        if (timer.current) clearTimeout(timer.current);
        pending.current = {};
        setDashboardState(DEFAULT_DASHBOARD_PREFS);
        setSidebarState(DEFAULT_SIDEBAR_PREFS);
        setSaveState("saving");
        void (async () => {
          const dash = await resetDashboardPrefsAction();
          const side = await saveSidebarPrefsAction(DEFAULT_SIDEBAR_PREFS);
          const ok = dash.ok && side.ok;
          setSaveState(ok ? "saved" : "error");
          if (ok) {
            router.refresh();
            fadeTimer.current = setTimeout(() => setSaveState("idle"), 2000);
          }
        })();
      },
    }),
    [dashboard, sidebar, navGroups, saveState, schedule, flush, router],
  );

  return <DashboardPrefsContext.Provider value={value}>{children}</DashboardPrefsContext.Provider>;
}

/**
 * Renders the widgets (built on the server, so data stays server-fetched) in
 * the user's order. Two columns on large screens, or one when the user picked
 * the stacked layout. An empty column collapses instead of leaving a gap.
 */
export function DashboardBody({ widgets }: { widgets: Record<WidgetId, React.ReactNode> }) {
  const { dashboard } = useDashboardPrefs();
  const { order, hidden, layout } = dashboard;

  // A widget with nothing to show (e.g. no blog posts yet) renders null: skip it so it leaves no gap.
  const render = (ids: WidgetId[]) =>
    ids.filter((id) => widgets[id] != null).map((id, i) => (
      <div key={id} className="mps-rise min-w-0" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
        {widgets[id]}
      </div>
    ));

  const top = widgetsInZone(order, hidden, "top");
  const main = widgetsInZone(order, hidden, "main");
  const rail = widgetsInZone(order, hidden, "rail");
  const split = layout === "split" && main.length > 0 && rail.length > 0;

  if (top.length + main.length + rail.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-8 text-center text-[14px] text-[var(--text-muted)]">
        All widgets are hidden. Use <span className="font-medium text-[var(--text)]">Customize</span> to bring some back.
      </p>
    );
  }

  return (
    <>
      {top.length > 0 && <div className="space-y-6">{render(top)}</div>}
      {main.length + rail.length > 0 && (
        <div className={cn("grid grid-cols-1 gap-6", split && "lg:grid-cols-3")}>
          {main.length > 0 && <div className={cn("min-w-0 space-y-6", split && "lg:col-span-2")}>{render(main)}</div>}
          {rail.length > 0 && <div className="min-w-0 space-y-6">{render(rail)}</div>}
        </div>
      )}
    </>
  );
}
