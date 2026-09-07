"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { runDueAutomations } from "@/lib/adapters/automations";
import { TRIGGERS, ACTIONS, isSupportedPair } from "@/lib/automations";
import { withPermission, entitlementGuard, limitGuard, ok, fail } from "./_helpers";

const schema = z.object({
  name: z.string().min(2).max(100),
  triggerType: z.enum(TRIGGERS),
  actionType: z.enum(ACTIONS),
  threshold: z.coerce.number().min(0).max(100).optional(),
});

export async function createAutomationAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("automations.manage");
  const orgId = ctx.active.org.id;
  const ent = await entitlementGuard(orgId, "automations", "Automations");
  if (ent) return ent;
  const existing = await db.automation.count({ where: { workspace: { orgId } } });
  const lim = await limitGuard(orgId, "automationLimit", existing, "automations");
  if (lim) return lim;
  const parsed = schema.safeParse({
    name: formData.get("name"),
    triggerType: formData.get("triggerType"),
    actionType: formData.get("actionType"),
    threshold: formData.get("threshold") || undefined,
  });
  if (!parsed.success) return fail("Check the automation fields");
  // The form only offers implemented pairs, but a hand-made POST could ask for
  // any combination — and one the engine cannot run would save happily and
  // then never do anything.
  if (!isSupportedPair(parsed.data.triggerType, parsed.data.actionType)) {
    return fail("That trigger and action can't be combined — pick an action from the list for this trigger");
  }

  await db.automation.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      name: parsed.data.name,
      triggerType: parsed.data.triggerType,
      triggerConfig: JSON.stringify(parsed.data.threshold ? { threshold: parsed.data.threshold } : {}),
      actionType: parsed.data.actionType,
      actionConfig: JSON.stringify(parsed.data.actionType === "tag_high_performer" ? { tag: "evergreen" } : {}),
    },
  });
  revalidatePath("/automations");
  return ok(undefined, "Automation created");
}

async function own(id: string, workspaceId: string) {
  const a = await db.automation.findUnique({ where: { id } });
  if (!a || a.workspaceId !== workspaceId) throw new Error("Automation not found");
  return a;
}

export async function toggleAutomationAction(id: string, enabled: boolean) {
  const ctx = await withPermission("automations.manage");
  await own(id, ctx.active.workspace.id);
  await db.automation.update({ where: { id }, data: { enabled } });
  revalidatePath("/automations");
  return ok();
}

export async function deleteAutomationAction(id: string) {
  const ctx = await withPermission("automations.manage");
  await own(id, ctx.active.workspace.id);
  await db.automation.delete({ where: { id } });
  revalidatePath("/automations");
  return ok(undefined, "Automation deleted");
}

export async function runAutomationsNowAction() {
  await withPermission("automations.manage");
  const res = await runDueAutomations(new Date(Date.now() + 120_000)); // bypass cooldown
  revalidatePath("/automations");
  return ok(res, `Ran ${res.ran} automation${res.ran === 1 ? "" : "s"}`);
}
