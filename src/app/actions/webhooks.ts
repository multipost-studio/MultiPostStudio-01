"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { deliverOnce } from "@/lib/adapters/webhooks";
import { withPermission, ok, fail } from "./_helpers";

export async function replayWebhookDeliveryAction(deliveryId: string) {
  const ctx = await withPermission("integrations.manage");

  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });

  if (!delivery || delivery.webhook.orgId !== ctx.active.org.id) {
    return fail("Delivery record not found");
  }

  const { webhook, payload, event } = delivery;
  const res = await deliverOnce(webhook.url, webhook.secret, payload);

  await db.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      event,
      payload,
      statusCode: res.status,
      success: res.ok,
      ...(res.error ? { error: `[Replay] ${res.error}` } : {}),
    },
  });

  revalidatePath("/settings/webhooks");
  revalidatePath("/settings/api");

  if (res.ok) {
    return ok(
      { status: res.status, success: true },
      `Payload redelivered successfully (HTTP ${res.status})`,
    );
  }

  return fail(
    res.error
      ? `Replay failed: ${res.error}`
      : `Replay returned HTTP ${res.status}`,
  );
}

export async function toggleWebhookActiveAction(id: string, active: boolean) {
  const ctx = await withPermission("integrations.manage");

  const wh = await db.webhook.findUnique({ where: { id } });
  if (!wh || wh.orgId !== ctx.active.org.id) {
    return fail("Webhook not found");
  }

  await db.webhook.update({
    where: { id },
    data: { active },
  });

  revalidatePath("/settings/webhooks");
  revalidatePath("/settings/api");
  return ok(undefined, active ? "Webhook enabled" : "Webhook paused");
}

export async function getWebhookSecretAction(id: string) {
  const ctx = await withPermission("integrations.manage");

  const wh = await db.webhook.findUnique({ where: { id } });
  if (!wh || wh.orgId !== ctx.active.org.id) {
    return fail("Webhook not found");
  }

  return ok({ secret: wh.secret });
}
