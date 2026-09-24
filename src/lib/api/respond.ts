import { NextResponse } from "next/server";

/**
 * Consistent envelope for the public API (`/api/v1/*`).
 * Mirrors the ApiResponse<T> shape in rules/typescript/patterns.md.
 */
export type ApiMeta = { total: number; page: number; limit: number };

export function apiOk<T>(data: T, meta?: ApiMeta, init?: ResponseInit) {
  return NextResponse.json({ success: true, data, error: null, ...(meta ? { meta } : {}) }, init);
}

export function apiError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
  init?: { headers?: HeadersInit; retryAfterSec?: number },
) {
  const headers = new Headers(init?.headers);
  if (status === 429) {
    // Always send Retry-After on 429 so well-behaved clients back off
    // instead of hammering. Defaults to 60s when the caller has no resetAt.
    headers.set("Retry-After", String(init?.retryAfterSec ?? 60));
  }
  return NextResponse.json({ success: false, data: null, error, ...extra }, { status, headers });
}

export function withRateLimitHeaders(res: Response, headers: HeadersInit) {
  const h = new Headers(headers);
  const out = new Headers(res.headers);
  h.forEach((v, k) => out.set(k, v));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

/** Parse ?page= & ?limit= with sane bounds. */
export function pagination(url: URL, maxLimit = 100) {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Keyset cursor for large tables: ?cursor=<id> & ?limit=. Stable under
 * concurrent inserts (unlike offset skip) and immune to deep-page scans.
 * Callers order by createdAt desc + id desc and filter id < cursor.
 */
export function keyset(url: URL, maxLimit = 100) {
  const limit = Math.min(maxLimit, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const raw = url.searchParams.get("cursor") ?? undefined;
  const cursor = raw && raw.length <= 100 ? raw : undefined;
  return { limit, cursor };
}
