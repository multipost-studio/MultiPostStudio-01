import { NextResponse } from "next/server";

/**
 * Consistent envelope for the public API (`/api/v1/*`).
 * Mirrors the ApiResponse<T> shape in rules/typescript/patterns.md.
 */
export type ApiMeta = { total: number; page: number; limit: number };

export function apiOk<T>(data: T, meta?: ApiMeta, init?: ResponseInit) {
  return NextResponse.json({ success: true, data, error: null, ...(meta ? { meta } : {}) }, init);
}

export function apiError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, data: null, error, ...extra }, { status });
}

/** Parse ?page= & ?limit= with sane bounds. */
export function pagination(url: URL, maxLimit = 100) {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  return { page, limit, skip: (page - 1) * limit };
}
