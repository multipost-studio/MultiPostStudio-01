"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { assertPermission } from "@/lib/rbac";

function splitList(raw: string): string[] {
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

export async function saveComplianceRulesAction(_prev: unknown, formData: FormData) {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.role, "workspace.manage");

  const forbiddenWords = splitList(String(formData.get("forbiddenWords") ?? ""));
  const disclaimerTriggers = splitList(String(formData.get("disclaimerTriggers") ?? ""));
  const requiredDisclaimer = String(formData.get("requiredDisclaimer") ?? "").trim();

  const hasAny = forbiddenWords.length > 0 || disclaimerTriggers.length > 0;
  await db.workspace.update({
    where: { id: ctx.active.workspace.id },
    data: { complianceRules: hasAny ? JSON.stringify({ forbiddenWords, disclaimerTriggers, requiredDisclaimer }) : null },
  });
  revalidatePath("/settings/workspace");
  return { ok: true, message: "Compliance rules saved" };
}
