/**
 * Webhook Center Diagnostics, Formatting, and Replay Utilities
 */

export interface WebhookStats {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  successRate: number;
}

export function computeWebhookStats(
  deliveries: { success: boolean; statusCode: number | null }[]
): WebhookStats {
  const total = deliveries.length;
  if (total === 0) {
    return {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      successRate: 100,
    };
  }

  const successful = deliveries.filter((d) => d.success).length;
  const failed = total - successful;
  const successRate = Number(((successful / total) * 100).toFixed(1));

  return {
    totalDeliveries: total,
    successfulDeliveries: successful,
    failedDeliveries: failed,
    successRate,
  };
}

export function formatWebhookPayloadPreview(payload: string, maxLength = 80): string {
  try {
    const parsed = JSON.parse(payload);
    const event = parsed.event || "event";
    const dataKeys = parsed.data && typeof parsed.data === "object"
      ? Object.keys(parsed.data).slice(0, 4).join(", ")
      : "";
    const summary = dataKeys ? `${event} (${dataKeys})` : event;
    return summary.length > maxLength ? `${summary.slice(0, maxLength)}...` : summary;
  } catch {
    return payload.slice(0, maxLength);
  }
}

export function getStatusCodeTone(
  status: number | null,
  success: boolean
): "success" | "danger" | "warning" | "neutral" {
  if (!status) return "danger";
  if (success && status >= 200 && status < 300) return "success";
  if (status >= 400 && status < 500) return "warning";
  return "danger";
}
