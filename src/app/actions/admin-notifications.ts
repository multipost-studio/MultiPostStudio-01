"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/session";
import { markAdminItemsSeen, markAllAdminSeen } from "@/lib/admin-notifications";

/**
 * Mark one derived notification item read for the calling admin. Read state is
 * per admin — one admin acknowledging a signal does not clear it for another.
 */
export async function dismissAdminItemAction(itemKey: string) {
  const admin = await requirePlatformAdmin();
  if (!itemKey || itemKey.length > 300) return { ok: false as const, error: "Bad item" };
  await markAdminItemsSeen(admin.id, [itemKey]);
  revalidatePath("/admin", "layout");
  return { ok: true as const };
}

/** Mark every currently-showing item read for the calling admin. */
export async function dismissAllAdminItemsAction() {
  const admin = await requirePlatformAdmin();
  const n = await markAllAdminSeen(admin.id);
  revalidatePath("/admin", "layout");
  return { ok: true as const, message: n === 0 ? "Nothing to clear" : `Marked ${n} read` };
}
