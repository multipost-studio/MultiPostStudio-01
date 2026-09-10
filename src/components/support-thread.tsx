import { relativeTime } from "@/lib/utils";

/**
 * Renders a support conversation. Server component — no state, no actions.
 *
 * `you` is the id of whoever is looking, so their own messages sit on the
 * right. Internal notes are only ever passed in for the staff view; the
 * customer-side query strips them before they reach this component.
 */

export type ThreadMsg = {
  id: string;
  authorRole: "user" | "staff";
  authorId: string;
  authorName?: string | null;
  internal: boolean;
  body: string;
  createdAt: Date | string;
};

export function SupportThread({ messages, you }: { messages: ThreadMsg[]; you: string }) {
  if (messages.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-6 text-center text-[13px] text-[var(--text-subtle)]">
        No replies yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const mine = m.authorId === you;
        const staff = m.authorRole === "staff";
        return (
          <li
            key={m.id}
            className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
          >
            <div
              className={[
                "max-w-[85%] rounded-[var(--radius-md)] px-3.5 py-2.5 text-[14px] leading-relaxed",
                m.internal
                  ? "border border-dashed border-[var(--warning)] bg-[var(--warning-soft)]/50 text-[var(--text)]"
                  : staff
                    ? "bg-[var(--primary-soft)] text-[var(--text)]"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
              ].join(" ")}
            >
              <div className="mb-1 flex items-center gap-2 text-[11px] text-[var(--text-subtle)]">
                <span className="font-semibold">
                  {m.internal ? "Internal note" : staff ? "Support" : m.authorName || "Customer"}
                </span>
                <span>·</span>
                <span>{relativeTime(new Date(m.createdAt))}</span>
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
