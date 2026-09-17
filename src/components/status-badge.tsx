import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Icon } from "@/components/icon";
import { POST_STATUS_META, type PostStatus } from "@/lib/constants";

const ICON: Record<string, string> = {
  pencil: "Pencil",
  clock: "Clock",
  check: "Check",
  calendar: "Calendar",
  loader: "Loader",
  "check-circle": "CheckCircle2",
  alert: "TriangleAlert",
  archive: "Archive",
};

const TONE: Record<string, BadgeTone> = {
  neutral: "neutral",
  warning: "warning",
  info: "info",
  success: "success",
  danger: "danger",
};

export function StatusBadge({ status }: { status: string }) {
  const meta = POST_STATUS_META[status as PostStatus] ?? { label: status, tone: "neutral", icon: "pencil" };
  return (
    <Badge tone={TONE[meta.tone] ?? "neutral"}>
      <Icon name={ICON[meta.icon] ?? "Circle"} size={11} />
      {meta.label}
    </Badge>
  );
}
