import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";

/**
 * Stub webhook dispatcher. Records a delivery row and simulates a 200 response.
 * Swap the `deliver` body for a real fetch with HMAC signing for production.
 */
export async function dispatchWebhook(orgId: string, event: string, payload: unknown) {
  const hooks = await db.webhook.findMany({ where: { orgId, active: true } });
  const targets = hooks.filter((h) => parseJson<string[]>(h.events, []).includes(event));
  if (targets.length === 0) return;

  await Promise.all(
    targets.map(async (h) => {
      // Simulated delivery — deterministic success in stub mode.
      const body = JSON.stringify({ event, sentAt: new Date().toISOString(), data: payload });
      await db.webhookDelivery.create({
        data: {
          webhookId: h.id,
          event,
          payload: body,
          statusCode: 200,
          success: true,
        },
      });
    }),
  );
}
