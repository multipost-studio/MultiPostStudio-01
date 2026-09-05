import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIPv4 } from "node:net";
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

// SSRF guard: outbound webhook URLs are admin-configured, but still block the
// obvious private/internal/cloud-metadata targets outright — a real external
// endpoint is never on these. `isSafeWebhookUrl` is the cheap literal-hostname
// pre-check (catches obvious cases fast, before any network call); the real
// gate against DNS rebinding is `resolvesToPrivateAddress` below, which
// resolves the hostname and checks the IP(s) it actually points at right now.
const BLOCKED_HOSTS = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1$|\[::1\])/i;

export function isSafeWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return !BLOCKED_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // malformed → treat as unsafe
  const [a, b] = parts;
  return (
    a === 127 || // loopback
    a === 10 || // private
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    a === 0 || // "this network"
    (a === 100 && b >= 64 && b <= 127) || // CGNAT shared address space
    (a === 198 && (b === 18 || b === 19)) // benchmark range
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true; // link-local + unique local (fc00::/7)
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * Resolves the hostname RIGHT NOW and checks every address it points at.
 * Closes the gap a hostname-string check can't: a public-looking domain that
 * resolves (immediately, or later via a short TTL / DNS rebind) to an
 * internal IP or the cloud metadata address. Fails closed — a lookup error
 * is treated as unsafe, not passed through.
 */
async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  try {
    const addrs = await dnsLookup(hostname, { all: true, verbatim: true });
    if (addrs.length === 0) return true;
    return addrs.some((a) => (isIPv4(a.address) ? isPrivateIPv4(a.address) : isPrivateIPv6(a.address)));
  } catch {
    return true;
  }
}

const MAX_REDIRECTS = 3;

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifySignature(secret: string, timestamp: string, rawBody: string, signature: string): boolean {
  const expected = signPayload(secret, timestamp, rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function deliverOnce(startUrl: string, secret: string | null, body: string): Promise<{ status: number; ok: boolean; error?: string }> {
  const ts = Math.floor(Date.now() / 1000).toString();
  let url = startUrl;

  // Manual redirect loop: re-validate hostname + resolved IP on every hop, not
  // just the first one — fetch()'s default auto-follow would otherwise let a
  // 302 from an initially-safe URL land on an internal address unchecked.
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafeWebhookUrl(url)) return { status: 0, ok: false, error: "blocked: private/internal URL" };
    const hostname = new URL(url).hostname;
    if (await resolvesToPrivateAddress(hostname)) {
      return { status: 0, ok: false, error: "blocked: resolves to a private/internal address" };
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "user-agent": "MultiPostStudio-Webhooks/1.0",
          "x-multipost-timestamp": ts,
          ...(secret ? { "x-multipost-signature": signPayload(secret, ts, body) } : {}),
        },
        body,
      });
    } catch (e) {
      return { status: 0, ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      clearTimeout(t);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    return { status: res.status, ok: res.status >= 200 && res.status < 300 };
  }
  return { status: 0, ok: false, error: "blocked: too many redirects" };
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
