export type AdminNavItem = { label: string; href: string; icon: string; group?: string };
export type AdminNavGroup = { title: string | null; items: AdminNavItem[] };

/** Consecutive items sharing a `group` become one group; ungrouped items (Overview) form an untitled group. */
export function groupNav(items: readonly AdminNavItem[]): AdminNavGroup[] {
  const groups: AdminNavGroup[] = [];
  for (const item of items) {
    const title = item.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }
  return groups;
}

/**
 * The one nav item that owns the current path: the longest href that is the
 * path or a parent of it. Plain startsWith() highlighted both "/admin/blog" and
 * "/admin/blog/categories" (and now would both "/admin/marketing" and
 * "/admin/marketing/links") at once.
 */
export function activeHref(items: readonly AdminNavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const hit = href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
    if (hit && (!best || href.length > best.length)) best = href;
  }
  return best;
}

/** Case-insensitive match on label or group, best matches (label prefix, then label contains, then group) first. */
export function filterNav(items: readonly AdminNavItem[], query: string): AdminNavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  const score = (i: AdminNavItem) => {
    const l = i.label.toLowerCase();
    if (l.startsWith(q)) return 0;
    if (l.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (l.includes(q)) return 2;
    if ((i.group ?? "").toLowerCase().includes(q)) return 3;
    return -1;
  };
  return items
    .map((i, idx) => ({ i, s: score(i), idx }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.idx - b.idx)
    .map((x) => x.i);
}
