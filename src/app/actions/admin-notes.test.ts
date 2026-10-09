import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminPermission: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    adminNote: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { requireAdminPermission } from "@/lib/session";
import { addAdminNoteAction, deleteAdminNoteAction, setAdminNotePinnedAction } from "./admin-notes";

const staff = { id: "s1", isPlatformAdmin: true, platformRole: "scoped" };
const full = { id: "f1", isPlatformAdmin: true, platformRole: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdminPermission).mockResolvedValue(staff as never);
  vi.mocked(db.user.findUnique).mockResolvedValue({ id: "u1" } as never);
  vi.mocked(db.organization.findUnique).mockResolvedValue({ id: "o1" } as never);
  vi.mocked(db.adminNote.count).mockResolvedValue(0 as never);
  vi.mocked(db.adminNote.create).mockResolvedValue({ id: "n1" } as never);
});

describe("addAdminNoteAction", () => {
  it("needs the notes.manage permission", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(addAdminNoteAction({ entityType: "user", entityId: "u1", body: "hi" })).rejects.toThrow("NEXT_REDIRECT");
    expect(requireAdminPermission).toHaveBeenCalledWith("notes.manage");
    expect(db.adminNote.create).not.toHaveBeenCalled();
  });

  it("saves a trimmed note against the author, audits without the note text, and refreshes the page", async () => {
    expect(await addAdminNoteAction({ entityType: "user", entityId: "u1", body: "  Asked for an invoice copy  ", pinned: true })).toMatchObject({ ok: true });
    expect(db.adminNote.create).toHaveBeenCalledWith({ data: { entityType: "user", entityId: "u1", body: "Asked for an invoice copy", pinned: true, authorId: "s1" } });
    const audit = vi.mocked(logAudit).mock.calls[0][0];
    expect(audit).toMatchObject({ action: "admin.note_added", targetType: "user", targetId: "u1", metadata: { noteId: "n1" } });
    expect(JSON.stringify(audit)).not.toContain("invoice copy");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("works for organizations", async () => {
    await addAdminNoteAction({ entityType: "organization", entityId: "o1", body: "VIP" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/orgs/o1");
  });

  it("rejects empty, oversized and badly shaped input", async () => {
    for (const bad of [
      { entityType: "user", entityId: "u1", body: "   " },
      { entityType: "user", entityId: "u1", body: "x".repeat(2001) },
      { entityType: "ticket", entityId: "u1", body: "hi" },
      { entityType: "user", entityId: "", body: "hi" },
      { entityType: "user", body: "hi" },
      null,
    ]) {
      expect(await addAdminNoteAction(bad)).toMatchObject({ ok: false });
    }
    expect(db.adminNote.create).not.toHaveBeenCalled();
  });

  it("refuses a record that does not exist or already has too many notes", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null as never);
    expect(await addAdminNoteAction({ entityType: "user", entityId: "ghost", body: "hi" })).toMatchObject({ ok: false });
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(db.adminNote.count).mockResolvedValue(200 as never);
    expect(await addAdminNoteAction({ entityType: "user", entityId: "u1", body: "hi" })).toMatchObject({ ok: false });
    expect(db.adminNote.create).not.toHaveBeenCalled();
  });
});

describe("pin and delete", () => {
  const note = { entityType: "user", entityId: "u1", authorId: "s1" };

  it("pins and unpins, with an audit event", async () => {
    vi.mocked(db.adminNote.findUnique).mockResolvedValue(note as never);
    expect(await setAdminNotePinnedAction("n1", true)).toMatchObject({ ok: true });
    expect(db.adminNote.update).toHaveBeenCalledWith({ where: { id: "n1" }, data: { pinned: true } });
    await setAdminNotePinnedAction("n1", false);
    expect(vi.mocked(logAudit).mock.calls.map((c) => c[0].action)).toEqual(["admin.note_pinned", "admin.note_unpinned"]);
  });

  it("rejects bad ids and unknown notes", async () => {
    expect(await setAdminNotePinnedAction("", true)).toMatchObject({ ok: false });
    expect(await setAdminNotePinnedAction("n1", "yes" as never)).toMatchObject({ ok: false });
    vi.mocked(db.adminNote.findUnique).mockResolvedValue(null as never);
    expect(await setAdminNotePinnedAction("n1", true)).toMatchObject({ ok: false });
    expect(await deleteAdminNoteAction("n1")).toMatchObject({ ok: false });
    expect(db.adminNote.update).not.toHaveBeenCalled();
    expect(db.adminNote.delete).not.toHaveBeenCalled();
  });

  it("the author can delete their own note", async () => {
    vi.mocked(db.adminNote.findUnique).mockResolvedValue(note as never);
    expect(await deleteAdminNoteAction("n1")).toMatchObject({ ok: true });
    expect(db.adminNote.delete).toHaveBeenCalledWith({ where: { id: "n1" } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.note_deleted", targetId: "u1" }));
  });

  it("a colleague cannot delete someone else's note, but a full administrator can", async () => {
    vi.mocked(db.adminNote.findUnique).mockResolvedValue({ ...note, authorId: "someone-else" } as never);
    expect(await deleteAdminNoteAction("n1")).toMatchObject({ ok: false });
    expect(db.adminNote.delete).not.toHaveBeenCalled();
    vi.mocked(requireAdminPermission).mockResolvedValue(full as never);
    expect(await deleteAdminNoteAction("n1")).toMatchObject({ ok: true });
    expect(db.adminNote.delete).toHaveBeenCalledTimes(1);
  });

  it("a note whose author account was deleted can still be removed by a full administrator", async () => {
    vi.mocked(db.adminNote.findUnique).mockResolvedValue({ ...note, authorId: null } as never);
    vi.mocked(requireAdminPermission).mockResolvedValue(full as never);
    expect(await deleteAdminNoteAction("n1")).toMatchObject({ ok: true });
  });
});
