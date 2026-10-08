import type { RawParams } from "@/lib/admin-query";
import { REVIEW_SOURCES, REVIEW_STATUSES } from "@/lib/reviews/model";
import type { AdminFilters } from "@/lib/reviews/repo";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function filtersFrom(raw: RawParams): AdminFilters & { tab: "reviews" | "settings" } {
  const status = one(raw.status);
  const source = one(raw.source);
  const rating = Number(one(raw.rating));
  const page = Number(one(raw.page));
  return {
    tab: one(raw.tab) === "settings" ? "settings" : "reviews",
    status: (REVIEW_STATUSES as readonly string[]).includes(status ?? "") ? (status as AdminFilters["status"]) : "all",
    source: (REVIEW_SOURCES as readonly string[]).includes(source ?? "") ? (source as AdminFilters["source"]) : "all",
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    featured: one(raw.featured) === "1" || undefined,
    privateOnly: one(raw.private) === "1" || undefined,
    q: (one(raw.q) ?? "").slice(0, 100) || undefined,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}
