"use client";

import * as React from "react";
import { Circle } from "lucide-react";
import { syncPresenceAction } from "@/app/actions/presence";

/**
 * "Sarah is typing a reply right now" — agent collision detection for the
 * inbox. Polled with a 15s interval, paused when the tab is in the background,
 * and unified into a single server roundtrip to minimize Supabase egress.
 */
export function PresenceIndicator({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) {
  const [others, setOthers] = React.useState<{ name: string; isTyping: boolean }[]>([]);
  const isTypingRef = React.useRef(isTyping);
  isTypingRef.current = isTyping;

  React.useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const res = await syncPresenceAction(conversationId, isTypingRef.current);
      if (!cancelled && res.ok && Array.isArray(res.data)) {
        setOthers(res.data as { name: string; isTyping: boolean }[]);
      }
    };

    // Initial check
    void tick();

    // 15-second interval instead of 4-second hammer-polling
    const timer = setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [conversationId]);

  // Sync immediately when isTyping flips (debounced)
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const res = await syncPresenceAction(conversationId, isTyping);
      if (res.ok && Array.isArray(res.data)) {
        setOthers(res.data as { name: string; isTyping: boolean }[]);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [conversationId, isTyping]);

  if (others.length === 0) return null;

  const typing = others.filter((o) => o.isTyping);
  const label =
    typing.length > 0
      ? `${typing.map((o) => o.name).join(", ")} ${typing.length === 1 ? "is" : "are"} typing a reply…`
      : `${others.map((o) => o.name).join(", ")} ${others.length === 1 ? "is" : "are"} viewing this conversation`;

  return (
    <p className="mb-2 flex items-center gap-1.5 text-[12.5px] text-[var(--warning)]">
      <Circle size={7} className="fill-current" /> {label}
    </p>
  );
}
