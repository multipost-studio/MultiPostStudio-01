import {
  AlertTriangle,
  AtSign,
  Bell,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Megaphone,
  MessageSquare,
  PlugZap,
  Send,
  ShieldAlert,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NotificationCategory, NotificationPriority } from "@/lib/notifications/types";

export type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

const CATEGORY_ICON: Record<NotificationCategory, LucideIcon> = {
  publishing: Send,
  scheduling: CalendarClock,
  engagement: TrendingUp,
  mentions: AtSign,
  team: Users,
  account: PlugZap,
  billing: CreditCard,
  system: Megaphone,
};

/** Finer than the category where it helps people tell events apart at a glance. */
export function iconFor(n: { type: string; category: NotificationCategory; priority: NotificationPriority }): { Icon: LucideIcon; tone: Tone } {
  switch (n.type) {
    case "publish_success":
      return { Icon: CheckCircle2, tone: "success" };
    case "publish_failed":
    case "post_missed":
      return { Icon: AlertTriangle, tone: "danger" };
    case "publish_partial":
      return { Icon: AlertTriangle, tone: "warning" };
    case "account_expired":
    case "account_expiring":
      return { Icon: PlugZap, tone: n.type === "account_expired" ? "danger" : "warning" };
    case "security_password_changed":
    case "security_two_factor":
      return { Icon: ShieldAlert, tone: "danger" };
    case "billing_payment_failed":
      return { Icon: CreditCard, tone: "danger" };
    case "comment":
      return { Icon: MessageSquare, tone: "info" };
    case "system":
      return { Icon: Megaphone, tone: "info" };
  }
  const Icon = CATEGORY_ICON[n.category] ?? Bell;
  const tone: Tone = n.priority === "critical" ? "danger" : n.priority === "high" ? "warning" : n.category === "engagement" ? "success" : "primary";
  return { Icon, tone };
}

export const TONE_CLASS: Record<Tone, string> = {
  primary: "bg-[var(--primary-soft)] text-[var(--primary)]",
  success: "bg-[var(--success)]/12 text-[var(--success)]",
  warning: "bg-[var(--warning)]/14 text-[var(--warning)]",
  danger: "bg-[var(--danger)]/12 text-[var(--danger)]",
  info: "bg-[var(--info)]/12 text-[var(--info)]",
  neutral: "bg-[var(--surface-hover)] text-[var(--text-muted)]",
};

/** "Today", "Yesterday", "Earlier this week", "Earlier": the heading a notification sits under. */
export function dayGroup(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - 86_400_000) return "Yesterday";
  if (t >= startOfToday - 6 * 86_400_000) return "Earlier this week";
  return "Earlier";
}
