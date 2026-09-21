import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseJson } from "@/lib/utils";
import { computeWebhookStats } from "@/lib/webhook-center";
import { WebhookCenterClient } from "./webhook-center-client";

export const metadata: Metadata = { title: "Webhook Center" };

export default async function WebhookCenterPage() {
  const ctx = await requireWorkspace();
  const orgId = ctx.active.org.id;
  const canManage = can(ctx.active.role, "integrations.manage");

  const [webhooks, deliveries] = await Promise.all([
    db.webhook.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        deliveries: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { success: true, statusCode: true, createdAt: true },
        },
      },
    }),
    db.webhookDelivery.findMany({
      where: { webhook: { orgId } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        webhookId: true,
        event: true,
        payload: true,
        statusCode: true,
        success: true,
        error: true,
        createdAt: true,
        webhook: {
          select: { url: true },
        },
      },
    }),
  ]);

  const stats = computeWebhookStats(deliveries);

  const formattedHooks = webhooks.map((w) => ({
    id: w.id,
    url: w.url,
    events: parseJson<string[]>(w.events, []),
    active: w.active,
    createdAt: w.createdAt.toISOString(),
    lastDelivery: w.deliveries[0]
      ? {
          success: w.deliveries[0].success,
          statusCode: w.deliveries[0].statusCode,
          createdAt: w.deliveries[0].createdAt.toISOString(),
        }
      : null,
  }));

  const formattedDeliveries = deliveries.map((d) => ({
    id: d.id,
    webhookId: d.webhookId,
    webhookUrl: d.webhook.url,
    event: d.event,
    payload: d.payload,
    statusCode: d.statusCode,
    success: d.success,
    error: d.error,
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <WebhookCenterClient
      canManage={canManage}
      stats={stats}
      initialWebhooks={formattedHooks}
      initialDeliveries={formattedDeliveries}
    />
  );
}
