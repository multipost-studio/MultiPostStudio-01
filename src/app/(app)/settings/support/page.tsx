import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";
import { SettingsSection } from "../_form";
import { queueSide, preview } from "@/lib/support";
import { NewTicketForm } from "./support-client";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const user = await requireUser();
  const tickets = await db.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: [{ lastReplyAt: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { messages: { where: { internal: false } } } } },
  });

  return (
    <>
      <SettingsSection
        title="Support"
        description="Open a request and follow the conversation here. We also reply by email."
      >
        <NewTicketForm />
      </SettingsSection>

      <SettingsSection title="Your tickets" description={tickets.length === 0 ? "Nothing yet." : ""}>
        {tickets.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">
            When you open a request or send feedback, it shows up here.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
            {tickets.map((t) => {
              const side = queueSide(t);
              return (
                <Link
                  key={t.id}
                  href={`/settings/support/${t.id}`}
                  className="flex flex-col gap-1 px-3.5 py-3 transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-[var(--text)]">{t.subject}</span>
                    {t.kind === "feedback" && <Badge tone="primary">feedback</Badge>}
                    <Badge tone={side === "done" ? "success" : side === "them" ? "neutral" : "warning"}>
                      {side === "done" ? t.status : side === "them" ? "awaiting your reply" : "with support"}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-[var(--text-muted)]">{preview(t.body, 110)}</p>
                  <p className="text-[11px] text-[var(--text-subtle)]">
                    {t._count.messages > 0 ? `${t._count.messages + 1} messages · ` : ""}
                    {relativeTime(t.lastReplyAt ?? t.createdAt)}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </SettingsSection>
    </>
  );
}
