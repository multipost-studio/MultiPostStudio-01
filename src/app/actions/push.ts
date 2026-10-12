"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { IMPERSONATION_BLOCKED_MESSAGE } from "@/lib/impersonation";
import { parsePushSubscription } from "@/lib/push/validate";
import { registerSubscription } from "@/lib/push/store";
import { sendTestPush } from "@/lib/push/send";

/**
 * Turning browser / phone notifications on or off for the device in front of the person, and testing them. Everything is
 * scoped to the signed-in user inside the query itself; a subscription belongs to exactly one account.
 */
type Result = { ok: boolean; message?: string; error?: string };

const NOT_CONFIGURED = "Push notifications aren't set up on this server yet.";

export async function savePushSubscriptionAction(raw: unknown, label?: string): Promise<Result> {
  const user = await requireUser();
  if (user.isImpersonated) return { ok: false, error: IMPERSONATION_BLOCKED_MESSAGE };
  if (!flags.webPush) return { ok: false, error: NOT_CONFIGURED };
  try {
    await enforceRateLimit(`push-save:${user.id}`, 20, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: "Too many attempts. Try again in a while." };
    throw e;
  }
  const parsed = parsePushSubscription(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const ua = (await headers()).get("user-agent");
  await registerSubscription(user.id, parsed.value, ua, label);
  revalidatePath("/settings/notifications");
  return { ok: true, message: "Notifications are on for this device." };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<Result> {
  const user = await requireUser();
  if (user.isImpersonated) return { ok: false, error: IMPERSONATION_BLOCKED_MESSAGE };
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2048) return { ok: false, error: "Invalid request" };
  await db.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } });
  revalidatePath("/settings/notifications");
  return { ok: true, message: "Device removed." };
}

/** Remove a device by its row id, for the device list (the page never sends endpoints back to the browser). */
export async function removePushDeviceAction(id: string): Promise<Result> {
  const user = await requireUser();
  if (user.isImpersonated) return { ok: false, error: IMPERSONATION_BLOCKED_MESSAGE };
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, error: "Invalid request" };
  const res = await db.pushSubscription.deleteMany({ where: { userId: user.id, id } });
  revalidatePath("/settings/notifications");
  return res.count > 0 ? { ok: true, message: "Device removed." } : { ok: false, error: "Device not found." };
}

export async function sendTestPushAction(): Promise<Result> {
  const user = await requireUser();
  if (user.isImpersonated) return { ok: false, error: IMPERSONATION_BLOCKED_MESSAGE };
  if (!flags.webPush) return { ok: false, error: NOT_CONFIGURED };
  try {
    await enforceRateLimit(`push-test:${user.id}`, 5, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: "That's enough tests for now. Try again in an hour." };
    throw e;
  }
  const r = await sendTestPush(user.id);
  if (r.reason === "no-devices") return { ok: false, error: "No device has notifications turned on yet." };
  if (!r.ok) return { ok: false, error: "The test couldn't be delivered. Turn notifications off and on again on this device." };
  return { ok: true, message: r.sent === 1 ? "Test sent. It should arrive in a moment." : `Test sent to ${r.sent} devices.` };
}
