import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { TicketStatus } from "../admin-client";

export const metadata: Metadata = { title: "Admin · Support" };

export default async function AdminSupportPage() {
  const tickets = await db.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } }, org: { select: { name: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--text)]">Support tickets</h1>
      {tickets.length === 0 ? (
        <EmptyState title="No tickets" description="Support requests will appear here." />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[15px] font-semibold text-[var(--text)]">{t.subject}</p>
                  <p className="text-[12px] text-[var(--text-subtle)]">
                    {t.user.name} ({t.user.email}) · {t.org?.name ?? "—"} · {relativeTime(t.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {t.kind === "feedback" && <Badge tone="primary">feedback</Badge>}
                  <Badge tone={t.priority === "urgent" || t.priority === "high" ? "danger" : "neutral"}>{t.priority}</Badge>
                  <TicketStatus id={t.id} status={t.status} />
                </div>
              </div>
              {/* Sent automatically with in-app feedback — usually the fastest
                  route to reproducing what they hit. */}
              {t.context && (
                <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
                  Sent from <code>{t.context}</code>
                </p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-[14px] text-[var(--text-muted)]">{t.body}</p>
              {t.attachmentUrl && (
                <a
                  href={t.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-[13px] text-[var(--primary)] underline"
                >
                  View attached screenshot
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
