/**
 * Per-user UI customisation. Pure module shared by server actions (validate
 * before saving), server components (normalise on read) and the client
 * customiser. Whatever is stored, readers always get a complete, valid shape:
 * unknown ids are dropped and widgets added in later releases are appended.
 */

export const DASHBOARD_WIDGETS = [
  { id: "quick", label: "Quick actions", description: "Shortcuts to create, connect and plan", zone: "top" },
  { id: "priorities", label: "Today's priorities", description: "Scheduled posts, approvals and hot conversations", zone: "main" },
  { id: "performance", label: "Performance", description: "Followers, reach and engagement trend", zone: "main" },
  { id: "ai", label: "AI recommendations", description: "Insights and suggested next steps", zone: "main" },
  { id: "upcoming", label: "Upcoming posts", description: "The next posts going out, with channel and time", zone: "main" },
  { id: "published", label: "Recently published", description: "Your latest live posts, with links", zone: "main" },
  { id: "blogs", label: "From the blog", description: "Fresh reads from the MultiPost Studio blog", zone: "main" },
  { id: "streak", label: "Posting streak", description: "Your consistency streak", zone: "rail" },
  { id: "health", label: "Social health score", description: "Overall account health", zone: "rail" },
  { id: "connections", label: "Connections", description: "Connected channels and their status", zone: "rail" },
  { id: "opportunities", label: "Content opportunities", description: "Trending topics worth posting about", zone: "rail" },
  { id: "goals", label: "Goals", description: "Progress against this period's targets", zone: "rail" },
  { id: "activity", label: "Recent activity", description: "Latest workspace events", zone: "rail" },
] as const;

export type WidgetId = (typeof DASHBOARD_WIDGETS)[number]["id"];
export type WidgetZone = (typeof DASHBOARD_WIDGETS)[number]["zone"];
export type DashboardLayout = "split" | "stacked";

export type DashboardPrefs = { order: WidgetId[]; hidden: WidgetId[]; layout: DashboardLayout };
export type SidebarPrefs = { showPromos: boolean; hiddenGroups: string[] };

const WIDGET_IDS = DASHBOARD_WIDGETS.map((w) => w.id) as WidgetId[];
const isWidgetId = (v: unknown): v is WidgetId => typeof v === "string" && (WIDGET_IDS as string[]).includes(v);
const zoneOf = (id: WidgetId): WidgetZone | undefined => DASHBOARD_WIDGETS.find((w) => w.id === id)?.zone;

export const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = { order: WIDGET_IDS, hidden: [], layout: "split" };
export const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = { showPromos: true, hiddenGroups: [] };

export function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function normalizeDashboardPrefs(raw: unknown): DashboardPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seen = new Set<WidgetId>();
  const order: WidgetId[] = [];
  for (const id of Array.isArray(o.order) ? o.order : []) {
    if (isWidgetId(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  for (const id of WIDGET_IDS) if (!seen.has(id)) order.push(id);
  const hidden = [...new Set((Array.isArray(o.hidden) ? o.hidden : []).filter(isWidgetId))];
  return { order, hidden, layout: o.layout === "stacked" ? "stacked" : "split" };
}

/** `validGroups` = nav group titles that can be hidden; the untitled primary group never can. */
export function normalizeSidebarPrefs(raw: unknown, validGroups?: readonly string[]): SidebarPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const groups = (Array.isArray(o.hiddenGroups) ? o.hiddenGroups : []).filter(
    (g): g is string => typeof g === "string" && g.length > 0 && g.length <= 60 && (!validGroups || validGroups.includes(g)),
  );
  return { showPromos: o.showPromos !== false, hiddenGroups: [...new Set(groups)] };
}

export function widgetsInZone(order: readonly WidgetId[], hidden: readonly WidgetId[], zone: WidgetZone): WidgetId[] {
  return order.filter((id) => !hidden.includes(id) && zoneOf(id) === zone);
}

/** Move one widget up/down among its own zone's widgets (keyboard / touch reorder). */
export function moveWidget(order: readonly WidgetId[], id: WidgetId, dir: -1 | 1): WidgetId[] {
  const sameZone = order.filter((x) => zoneOf(x) === zoneOf(id));
  const i = sameZone.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sameZone.length) return [...order];
  const other = sameZone[j];
  return order.map((x) => (x === id ? other : x === other ? id : x));
}

/** Drag-and-drop: place `id` where `overId` is (same zone only). */
export function reorderWidget(order: readonly WidgetId[], id: WidgetId, overId: WidgetId): WidgetId[] {
  if (id === overId || zoneOf(id) !== zoneOf(overId)) return [...order];
  const from = order.indexOf(id);
  const to = order.indexOf(overId);
  const next = order.filter((x) => x !== id);
  next.splice(next.indexOf(overId) + (from < to ? 1 : 0), 0, id);
  return next;
}
