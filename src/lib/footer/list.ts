/** Immutable list edits for the footer editor: every function returns a new array. */

export function moveItem<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function updateItem<T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] {
  return list.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

export function removeItem<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id);
}

/** Show or hide one href in a column's "hidden" list. */
export function toggleHidden(hidden: string[], href: string, shown: boolean): string[] {
  const without = hidden.filter((h) => h !== href);
  return shown ? without : [...without, href];
}
