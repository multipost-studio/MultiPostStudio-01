"use client";

import * as React from "react";
import { Circle } from "lucide-react";
import { heartbeatPresenceAction, getPresenceAction } from "@/app/actions/presence";

/**
 * "Sarah is typing a reply right now" — agent collision detection for the
 * inbox. Polled (every 4s), not a live socket: this app already runs a
 * cron-tick poller for the publish queue (see TickPoller), so a second
 * lightweight interval is consistent with how the rest of it works and adds
 * no new infrastructure. Good enough to stop two agents answering the same
 * comment; not meant to be sub-second.
 */
export function PresenceIndicator({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) {
  const [others, setOthers] = React.useState<{ name: string; isTyping: boolean }[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      await heartbeatPresenceAction(conversationId, isTyping);
      const res = await getPresenceAction(conversationId);
      if (!cancelled && res.ok && Array.isArray(res.data)) {
        setOthers(res.data as { name: string; isTyping: boolean }[]);
      }
    };

    // Re-fires immediately when isTyping flips (not just every 4s), so
    // "started typing" propagates without waiting on the poll interval.
    void tick();
    const timer = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
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
