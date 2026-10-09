"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from "@/app/actions/notifications";
import type { NotificationDTO, NotificationFilter } from "@/lib/notifications/service";

export type Feed = { items: NotificationDTO[]; nextCursor: string | null; unread: number };
export type FeedStatus = "idle" | "loading" | "error";

async function fetchFeed(params: { filter: NotificationFilter; q?: string; cursor?: string | null }, signal?: AbortSignal): Promise<Feed> {
  const sp = new URLSearchParams({ filter: params.filter, limit: "20" });
  if (params.q) sp.set("q", params.q);
  if (params.cursor) sp.set("cursor", params.cursor);
  const res = await fetch(`/api/notifications?${sp.toString()}`, { cache: "no-store", signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as Feed;
}

/**
 * The list behind the bell panel and the /notifications page: one place for loading, paging, searching
 * and the optimistic read/unread/delete changes. Every change updates the screen first and is rolled back
 * if the server says no, so a click never feels slow and never leaves the badge lying.
 */
export function useNotificationFeed(args: { filter: NotificationFilter; q?: string; initial?: Feed; initialFilter?: NotificationFilter; enabled?: boolean }) {
  const { filter, q = "", enabled = true } = args;
  const [items, setItems] = useState<NotificationDTO[]>(args.initial?.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(args.initial?.nextCursor ?? null);
  const [unread, setUnread] = useState(args.initial?.unread ?? 0);
  const [status, setStatus] = useState<FeedStatus>("idle");
  const [loadingMore, setLoadingMore] = useState(false);
  const [, startTransition] = useTransition();
  const abort = useRef<AbortController | null>(null);
  const seeded = useRef(args.initial !== undefined && (args.initialFilter ?? "all") === filter && q === "");

  const reload = useCallback(async () => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setStatus("loading");
    try {
      const f = await fetchFeed({ filter, q }, ac.signal);
      setItems(f.items);
      setNextCursor(f.nextCursor);
      setUnread(f.unread);
      setStatus("idle");
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      setStatus("error");
    }
  }, [filter, q]);

  // Load on filter/search change. The first render already has server-provided data for the default view.
  useEffect(() => {
    if (!enabled) return;
    if (seeded.current) {
      seeded.current = false;
      return;
    }
    const t = setTimeout(() => void reload(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [enabled, reload, q]);

  useEffect(() => () => abort.current?.abort(), []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const f = await fetchFeed({ filter, q, cursor: nextCursor });
      setItems((cur) => {
        const seen = new Set(cur.map((i) => i.id));
        return [...cur, ...f.items.filter((i) => !seen.has(i.id))];
      });
      setNextCursor(f.nextCursor);
      setUnread(f.unread);
    } catch {
      setStatus("error");
    } finally {
      setLoadingMore(false);
    }
  }, [filter, q, nextCursor, loadingMore]);

  const patch = useCallback((id: string, p: Partial<NotificationDTO>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i))), []);

  const markRead = useCallback(
    (n: NotificationDTO) => {
      if (n.readAt) return;
      const at = new Date().toISOString();
      patch(n.id, { readAt: at });
      setUnread((u) => Math.max(0, u - 1));
      startTransition(async () => {
        const r = await markNotificationReadAction(n.id).catch(() => ({ ok: false }) as const);
        if (!r.ok) {
          patch(n.id, { readAt: null });
          setUnread((u) => u + 1);
        } else if ("unread" in r && typeof r.unread === "number") setUnread(r.unread);
      });
    },
    [patch],
  );

  const toggleRead = useCallback(
    (n: NotificationDTO) => {
      if (!n.readAt) return markRead(n);
      patch(n.id, { readAt: null });
      setUnread((u) => u + 1);
      startTransition(async () => {
        const r = await markNotificationUnreadAction(n.id).catch(() => ({ ok: false }) as const);
        if (!r.ok) {
          patch(n.id, { readAt: n.readAt });
          setUnread((u) => Math.max(0, u - 1));
        } else if ("unread" in r && typeof r.unread === "number") setUnread(r.unread);
      });
    },
    [markRead, patch],
  );

  const markAll = useCallback(() => {
    const before = items;
    const beforeUnread = unread;
    const at = new Date().toISOString();
    setItems((cur) => cur.map((i) => (i.readAt ? i : { ...i, readAt: at })));
    setUnread(0);
    startTransition(async () => {
      const r = await markAllNotificationsReadAction(filter === "unread" || filter === "read" ? "all" : filter).catch(() => ({ ok: false }) as const);
      if (!r.ok) {
        setItems(before);
        setUnread(beforeUnread);
      } else {
        // A category tab only clears that category: take the real count back from the server.
        if ("unread" in r && typeof r.unread === "number") setUnread(r.unread);
        void reload();
      }
    });
  }, [items, unread, filter, reload]);

  const remove = useCallback(
    (n: NotificationDTO) => {
      const idx = items.findIndex((i) => i.id === n.id);
      setItems((cur) => cur.filter((i) => i.id !== n.id));
      if (!n.readAt) setUnread((u) => Math.max(0, u - 1));
      startTransition(async () => {
        const r = await deleteNotificationAction(n.id).catch(() => ({ ok: false }) as const);
        if (!r.ok) {
          setItems((cur) => (cur.some((i) => i.id === n.id) ? cur : [...cur.slice(0, idx), n, ...cur.slice(idx)]));
          if (!n.readAt) setUnread((u) => u + 1);
        }
      });
    },
    [items],
  );

  return { items, nextCursor, unread, setUnread, status, loadingMore, reload, loadMore, markRead, toggleRead, markAll, remove };
}
