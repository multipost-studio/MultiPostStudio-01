import { db } from "@/lib/db";
import { getCurrentUser, getStaffPermissions } from "@/lib/session";
import { isSuperAdmin } from "@/lib/admin-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, relativeTime } from "@/lib/utils";
import { NoteForm, NoteRowActions } from "./_notes-client";

/**
 * Internal notes for a user or organization page. Renders nothing for staff without `notes.view`, so a page can
 * include it unconditionally. Notes are private to platform staff and never appear in anything a customer can see.
 */
export async function AdminNotes({ entityType, entityId }: { entityType: "user" | "organization"; entityId: string }) {
  const perms = await getStaffPermissions();
  if (!perms.has("notes.view")) return null;
  const canManage = perms.has("notes.manage");
  const me = await getCurrentUser();

  const notes = await db.adminNote
    .findMany({
      where: { entityType, entityId },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: { id: true, body: true, pinned: true, createdAt: true, authorId: true, author: { select: { name: true, email: true } } },
    })
    // A notes table that has not been migrated yet must not take the customer page down with it.
    .catch(() => null);
  if (notes === null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal notes ({notes.length})</CardTitle>
        <p className="text-[13px] text-[var(--text-muted)]">Only platform staff can see these. They are never shown to the customer.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {canManage && <NoteForm entityType={entityType} entityId={entityId} />}
        {notes.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">No notes yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {notes.map((n) => (
              <li key={n.id} className="space-y-1 py-3 first:pt-0">
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text)]">{n.author?.name || n.author?.email || "Former staff member"}</span>
                  <span title={formatDate(n.createdAt)}>{relativeTime(n.createdAt)}</span>
                  {n.pinned && <Badge tone="primary">pinned</Badge>}
                </div>
                <p className="whitespace-pre-wrap break-words text-[14px] text-[var(--text)]">{n.body}</p>
                {canManage && <NoteRowActions id={n.id} pinned={n.pinned} canDelete={!!me && (n.authorId === me.id || isSuperAdmin(me))} />}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
