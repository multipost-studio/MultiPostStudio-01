import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * Outbound webhook delivery. Real HTTP POST with an HMAC-SHA256 signature over
 * the raw body, a short timeout, and up to 3 attempts with backoff. Each attempt
 * is recorded in webhook_delivery.
 *
 * Consumers verify with:
 *   signature === "sha256=" + hmac(secret, `${timestamp}.${rawBody}`)
 */

const TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifySignature(secret: string, timestamp: string, rawBody: string, signature: string): boolean {
  const expected = signPayload(secret, timestamp, rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function deliverOnce(url: string, secret: string | null, body: string): Promise<{ status: number; ok: boolean; error?: string }> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "MultiPostStudio-Webhooks/1.0",
        "x-multipost-timestamp": ts,
        ...(secret ? { "x-multipost-signature": signPayload(secret, ts, body) } : {}),
      },
      body,
    });
    return { status: res.status, ok: res.status >= 200 && res.status < 300 };
  } catch (e) {
    return { status: 0, ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

/** Fire one real signed delivery at a single webhook (the "Test" button). */
export async function sendTestEvent(webhookId: string): Promise<{ status: number; ok: boolean; error?: string }> {
  const hook = await db.webhook.findUnique({ where: { id: webhookId } });
  if (!hook) return { status: 0, ok: false, error: "webhook not found" };
  const body = JSON.stringify({ event: "test.ping", sentAt: new Date().toISOString(), data: { test: true } });
  const res = await deliverOnce(hook.url, hook.secret, body);
  await db.webhookDelivery.create({
    data: {
      webhookId: hook.id,
      event: "test.ping",
      payload: body,
      statusCode: res.status,
      success: res.ok,
      ...(res.error ? { error: res.error } : {}),
    },
  });
  if (!res.ok) {
    logger.warn({ webhookId, url: hook.url, status: res.status, error: res.error }, "webhook test delivery failed");
  }
  return res;
}

export async function dispatchWebhook(orgId: string, event: string, payload: unknown) {
  const hooks = await db.webhook.findMany({ where: { orgId, active: true } });
  const targets = hooks.filter((h) => parseJson<string[]>(h.events, []).includes(event));
  if (targets.length === 0) return;

  const body = JSON.stringify({ event, sentAt: new Date().toISOString(), data: payload });

  await Promise.all(
    targets.map(async (h) => {
      let last: { status: number; ok: boolean; error?: string } = { status: 0, ok: false };
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        last = await deliverOnce(h.url, h.secret, body);
        if (last.ok) break;
        if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
      await db.webhookDelivery.create({
        data: {
          webhookId: h.id,
          event,
          payload: body,
          statusCode: last.status,
          success: last.ok,
          ...(last.error ? { error: last.error } : {}),
        },
      });
      if (!last.ok) {
        logger.warn({ webhookId: h.id, url: h.url, event, status: last.status, error: last.error }, "webhook delivery failed");
      }
    }),
  );
}
