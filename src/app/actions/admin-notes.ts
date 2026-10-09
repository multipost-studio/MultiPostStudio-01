"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { isSuperAdmin } from "@/lib/admin-permissions";

/**
 * Internal notes about a customer. Private to platform staff: nothing here is ever sent to or shown to the customer.
 * The note text is deliberately kept out of the audit log (it can hold personal details); the log records who did what to
 * which record, the note itself stays in AdminNote.
 */
type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const NOTE_MAX_LENGTH = 2000;
const MAX_NOTES_PER_RECORD = 200;
const ENTITY_TYPES = ["user", "organization"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const addInput = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1).max(64),
  body: z.string().trim().min(1, "Write something first").max(NOTE_MAX_LENGTH, `Notes can be up to ${NOTE_MAX_LENGTH} characters`),
  pinned: z.boolean().optional(),
});

async function entityExists(type: EntityType, id: string): Promise<boolean> {
  if (type === "user") return !!(await db.user.findUnique({ where: { id }, select: { id: true } }));
  return !!(await db.organization.findUnique({ where: { id }, select: { id: true } }));
}

const pathFor = (type: string, id: string) => (type === "user" ? `/admin/users/${id}` : `/admin/orgs/${id}`);

export async function addAdminNoteAction(input: unknown): Promise<Result> {
  const admin = await requireAdminPermission("notes.manage");
  const p = addInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid note");
  const { entityType, entityId, body, pinned } = p.data;
  if (!(await entityExists(entityType, entityId))) return fail("That record no longer exists");
  const count = await db.adminNote.count({ where: { entityType, entityId } });
  if (count >= MAX_NOTES_PER_RECORD) return fail("This record has reached its note limit. Delete old notes first.");

  const note = await db.adminNote.create({ data: { entityType, entityId, body, pinned: !!pinned, authorId: admin.id } });
  await logAudit({ actorId: admin.id, action: "admin.note_added", targetType: entityType, targetId: entityId, metadata: { noteId: note.id } });
  revalidatePath(pathFor(entityType, entityId));
  return { ok: true, message: "Note added" };
}

export async function setAdminNotePinnedAction(id: string, pinned: boolean): Promise<Result> {
  const admin = await requireAdminPermission("notes.manage");
  if (typeof id !== "string" || !id || typeof pinned !== "boolean") return fail("Invalid request");
  const note = await db.adminNote.findUnique({ where: { id }, select: { entityType: true, entityId: true } });
  if (!note) return fail("Note not found");
  await db.adminNote.update({ where: { id }, data: { pinned } });
  await logAudit({ actorId: admin.id, action: pinned ? "admin.note_pinned" : "admin.note_unpinned", targetType: note.entityType, targetId: note.entityId, metadata: { noteId: id } });
  revalidatePath(pathFor(note.entityType, note.entityId));
  return { ok: true };
}

/** A note can be removed by its author or by a full administrator; nobody else can erase a colleague's note. */
export async function deleteAdminNoteAction(id: string): Promise<Result> {
  const admin = await requireAdminPermission("notes.manage");
  if (typeof id !== "string" || !id) return fail("Invalid request");
  const note = await db.adminNote.findUnique({ where: { id }, select: { entityType: true, entityId: true, authorId: true } });
  if (!note) return fail("Note not found");
  if (note.authorId !== admin.id && !isSuperAdmin(admin)) return fail("Only the author or a full administrator can delete this note");
  await db.adminNote.delete({ where: { id } });
  await logAudit({ actorId: admin.id, action: "admin.note_deleted", targetType: note.entityType, targetId: note.entityId, metadata: { noteId: id } });
  revalidatePath(pathFor(note.entityType, note.entityId));
  return { ok: true, message: "Note deleted" };
}
