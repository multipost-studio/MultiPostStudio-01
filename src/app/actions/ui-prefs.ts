"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logger } from "@/lib/logger";
import { NAV } from "@/lib/nav";
import { normalizeDashboardPrefs, normalizeSidebarPrefs, type DashboardPrefs, type SidebarPrefs } from "@/lib/ui-prefs";

type Result = { ok: true } | { ok: false; error: string };

// Autosaves fire in the background: an expired session reports an error in the
// customiser instead of redirecting the page to /login mid-edit.
const SIGN_IN_AGAIN: Result = { ok: false, error: "Please sign in again to save your changes." };

const GROUPS = NAV.map((g) => g.title).filter(Boolean);

/** Autosave target for the dashboard customiser. Input is re-normalised, never trusted. */
export async function saveDashboardPrefsAction(input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return SIGN_IN_AGAIN;
  const prefs: DashboardPrefs = normalizeDashboardPrefs(input);
  try {
    await db.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, dashboard: JSON.stringify(prefs) },
      update: { dashboard: JSON.stringify(prefs) },
    });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    logger.error({ err, userId: user.id }, "saveDashboardPrefsAction failed");
    return { ok: false, error: "Couldn't save your layout. Please try again." };
  }
}

export async function resetDashboardPrefsAction(): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return SIGN_IN_AGAIN;
  try {
    await db.userPreference.updateMany({ where: { userId: user.id }, data: { dashboard: null } });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    logger.error({ err, userId: user.id }, "resetDashboardPrefsAction failed");
    return { ok: false, error: "Couldn't reset your layout. Please try again." };
  }
}

export async function saveSidebarPrefsAction(input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return SIGN_IN_AGAIN;
  const prefs: SidebarPrefs = normalizeSidebarPrefs(input, GROUPS);
  try {
    await db.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, sidebar: JSON.stringify(prefs) },
      update: { sidebar: JSON.stringify(prefs) },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logger.error({ err, userId: user.id }, "saveSidebarPrefsAction failed");
    return { ok: false, error: "Couldn't save your sidebar settings. Please try again." };
  }
}
