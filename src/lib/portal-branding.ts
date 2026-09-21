/**
 * Portal Branding and Client Portal Presentation Helpers
 */

export interface PortalBrandingConfig {
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export function validateHexColor(color: string | null | undefined): boolean {
  if (!color || color.trim() === "") return true;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim());
}

export function validateLogoUrl(url: string | null | undefined): boolean {
  if (!url || url.trim() === "") return true;
  const trimmed = url.trim();
  if (trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      (parsed.protocol === "data:" && trimmed.startsWith("data:image/"))
    );
  } catch {
    // Relative paths are acceptable in local/dev
    return trimmed.startsWith("/");
  }
}

export interface PortalCalendarPost {
  id: string;
  title: string | null;
  status: string;
  scheduledAt: Date | string | null;
  publishedAt: Date | string | null;
  channels: { platform: string; body: string }[];
  mediaUrls: string[];
}

export interface GroupedCalendarDay {
  dateKey: string;
  displayDate: string;
  isToday: boolean;
  isPast: boolean;
  posts: PortalCalendarPost[];
}

export function groupPostsByDate(
  posts: PortalCalendarPost[],
  referenceDate: Date = new Date()
): GroupedCalendarDay[] {
  const groups: Record<string, PortalCalendarPost[]> = {};
  const refDateStr = referenceDate.toISOString().slice(0, 10);

  for (const post of posts) {
    const rawDate = post.scheduledAt || post.publishedAt;
    const dateObj = rawDate ? new Date(rawDate) : new Date();
    const dateKey = !isNaN(dateObj.getTime()) ? dateObj.toISOString().slice(0, 10) : "unscheduled";

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(post);
  }

  const sortedKeys = Object.keys(groups).sort();

  return sortedKeys.map((key) => {
    let displayDate = "Unscheduled";
    let isToday = false;
    let isPast = false;

    if (key !== "unscheduled") {
      const d = new Date(key + "T00:00:00");
      displayDate = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      isToday = key === refDateStr;
      isPast = key < refDateStr;
    }

    return {
      dateKey: key,
      displayDate,
      isToday,
      isPast,
      posts: groups[key],
    };
  });
}

export interface PortalSummaryStats {
  pendingReviewCount: number;
  upcomingScheduledCount: number;
  publishedCount: number;
  totalChannels: number;
}

export function calculatePortalSummaryStats(
  requests: { status: string }[],
  posts: { status: string; channels: { platform: string }[] }[]
): PortalSummaryStats {
  const pendingReviewCount = requests.filter(
    (r) => r.status === "in_review" || r.status === "changes_requested"
  ).length;

  const upcomingScheduledCount = posts.filter((p) => p.status === "scheduled").length;
  const publishedCount = posts.filter((p) => p.status === "published").length;

  const uniqueChannels = new Set<string>();
  for (const p of posts) {
    for (const c of p.channels) {
      uniqueChannels.add(c.platform);
    }
  }

  return {
    pendingReviewCount,
    upcomingScheduledCount,
    publishedCount,
    totalChannels: uniqueChannels.size,
  };
}
