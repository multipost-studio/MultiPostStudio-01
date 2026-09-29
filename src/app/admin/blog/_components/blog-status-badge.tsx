import { Badge } from "@/components/ui/badge";

export function BlogStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "published":
      return <Badge tone="success">Published</Badge>;
    case "scheduled":
      return <Badge tone="info">Scheduled</Badge>;
    case "pending_review":
      return <Badge tone="warning">Pending Review</Badge>;
    case "archived":
      return <Badge tone="neutral">Archived</Badge>;
    case "deleted":
      return <Badge tone="danger">Trash</Badge>;
    case "draft":
    default:
      return <Badge tone="neutral">Draft</Badge>;
  }
}
