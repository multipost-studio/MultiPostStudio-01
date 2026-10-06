/**
 * Shared parsing for admin list-page URL state: ?q= search, ?page= / ?perPage=
 * pagination, ?sort= / ?dir= sorting, plus any number of ?<key>= filters.
 */

export type RawParams = Record<string, string | string[] | undefined>;

export type AdminQuery = {
  q: string;
  page: number;
  perPage: number;
  skip: number;
  sort: string;
  dir: "asc" | "desc";
  filters: Record<string, string>;
};

const PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;

export type AdminQueryOpts = { defaultSort: string; sortable: string[]; filterKeys?: string[]; defaultPerPage?: number };

export function parseAdminQuery(
  raw: RawParams,
  opts: AdminQueryOpts = {
    defaultSort: "createdAt",
    sortable: ["createdAt"],
  },
): AdminQuery {
  const s = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : raw[k]) ?? "";
  const page = Math.max(1, parseInt(s("page")) || 1);
  let perPage = parseInt(s("perPage")) || opts.defaultPerPage || 50;
  if (!PER_PAGE_OPTIONS.includes(perPage as never)) perPage = opts.defaultPerPage || 50;
  let sort = s("sort") || opts.defaultSort;
  if (!opts.sortable.includes(sort)) sort = opts.defaultSort;
  const dir: "asc" | "desc" = s("dir") === "asc" ? "asc" : "desc";

  const filters: Record<string, string> = {};
  for (const k of opts.filterKeys ?? []) {
    const v = s(k);
    if (v) filters[k] = v;
  }

  return { q: s("q").trim(), page, perPage, skip: (page - 1) * perPage, sort, dir, filters };
}

/** Build a querystring from the current query plus a patch (null clears a key). */
export function adminQueryString(current: AdminQuery, patch: Record<string, string | number | null>): string {
  const p = new URLSearchParams();
  if (current.q) p.set("q", current.q);
  if (current.page > 1) p.set("page", String(current.page));
  if (current.perPage !== 50) p.set("perPage", String(current.perPage));
  if (current.sort !== "createdAt") p.set("sort", current.sort);
  if (current.dir !== "desc") p.set("dir", current.dir);
  for (const [k, v] of Object.entries(current.filters)) p.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") p.delete(k);
    else p.set(k, String(v));
  }
  const str = p.toString();
  return str ? `?${str}` : "";
}

export { PER_PAGE_OPTIONS };

/** Filter keys every date-aware list adds to its `filterKeys`. */
export const DATE_FILTER_KEYS = ["from", "to"] as const;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function utcDay(v: string | undefined, endOfDay: boolean): Date | undefined {
  if (!v || !DAY_RE.test(v)) return undefined;
  const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  // new Date("2026-13-45T..") is Invalid Date; "2026-02-31" silently rolls over, so round-trip check it.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return undefined;
  return d;
}

/**
 * Prisma-ready `{ gte, lte }` from the ?from= / ?to= filters (UTC days, inclusive).
 * Malformed dates are ignored rather than failing the page; a reversed range
 * (from after to) is swapped so it still means "between these two days".
 */
export function dateRange(filters: Record<string, string>): { gte?: Date; lte?: Date } | undefined {
  let from = utcDay(filters.from, false);
  let to = utcDay(filters.to, true);
  if (from && to && from.getTime() > to.getTime()) {
    const swappedFrom = utcDay(filters.to, false);
    const swappedTo = utcDay(filters.from, true);
    from = swappedFrom;
    to = swappedTo;
  }
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}
