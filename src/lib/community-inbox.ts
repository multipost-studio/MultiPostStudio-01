/**
 * MultiPost Studio — Social Inbox & Community Management Engine
 *
 * Provides variable expansion for saved replies, multi-dimensional
 * inbox filtering, sentiment classification helpers, and priority queue scoring.
 */

export interface SavedReplyVariables {
  authorName?: string | null;
  authorHandle?: string | null;
  platform?: string | null;
  workspaceName?: string | null;
}

/**
 * Expands placeholders in saved reply templates:
 * - {{name}} or {{author}} -> Author's display name or first name
 * - {{handle}} -> Platform handle
 * - {{platform}} -> Capitalized platform name
 * - {{workspace}} -> Organization/workspace name
 */
export function expandSavedReply(template: string, vars: SavedReplyVariables): string {
  if (!template) return "";

  const name = vars.authorName?.trim() || "there";
  const firstName = name.split(" ")[0] || "there";
  const handle = vars.authorHandle?.trim() || "";
  const platform = vars.platform ? vars.platform.charAt(0).toUpperCase() + vars.platform.slice(1) : "";
  const workspace = vars.workspaceName?.trim() || "our team";

  return template
    .replace(/\{\{\s*(?:name|author)\s*\}\}/gi, name)
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*handle\s*\}\}/gi, handle)
    .replace(/\{\{\s*platform\s*\}\}/gi, platform)
    .replace(/\{\{\s*workspace\s*\}\}/gi, workspace);
}

export type InboxStatusFilter = "all" | "open" | "pending" | "snoozed" | "done" | "assigned";
export type InboxSentimentFilter = "all" | "positive" | "neutral" | "negative";
export type InboxSortOption = "priority_desc" | "newest" | "oldest";

export interface ConversationItem {
  id: string;
  platform: string;
  type: string;
  authorName: string;
  authorHandle: string;
  preview: string;
  status: string;
  sentiment: string | null;
  priority: number;
  rating: number | null;
  labels: string[];
  assignee: { id: string; name: string } | null;
  lastMessageAt: string;
}

export interface FilterSortOptions {
  status?: string;
  sentiment?: string;
  platform?: string;
  label?: string;
  searchQuery?: string;
  sort?: InboxSortOption;
}

/**
 * Calculates an urgency score for priority ranking:
 * - High base priority: +30 to +50 points
 * - Negative sentiment: +25 points (needs immediate de-escalation)
 * - VIP/Lead label: +20 points
 * - Open & unassigned: +10 points
 */
export function calculateUrgencyScore(c: ConversationItem): number {
  let score = c.priority * 15;
  if (c.sentiment === "negative") score += 25;
  if (c.labels.some((l) => ["vip", "urgent", "lead", "bug"].includes(l.toLowerCase()))) score += 20;
  if (c.status === "open" && !c.assignee) score += 10;
  return score;
}

/**
 * Filters and sorts conversations based on multiple criteria.
 */
export function filterAndSortConversations<T extends ConversationItem>(
  items: T[],
  options: FilterSortOptions,
): T[] {
  const {
    status = "open",
    sentiment = "all",
    platform = "",
    label = "",
    searchQuery = "",
    sort = "priority_desc",
  } = options;

  const query = searchQuery.trim().toLowerCase();

  const filtered = items.filter((c) => {
    // Status filter
    if (status !== "all") {
      if (status === "assigned") {
        if (!c.assignee) return false;
      } else if (c.status !== status) {
        return false;
      }
    }

    // Platform filter
    if (platform && c.platform !== platform) {
      return false;
    }

    // Sentiment filter
    if (sentiment !== "all") {
      if (c.sentiment !== sentiment) return false;
    }

    // Label filter
    if (label && !c.labels.map((l) => l.toLowerCase()).includes(label.toLowerCase())) {
      return false;
    }

    // Search query
    if (query) {
      const matchName = c.authorName.toLowerCase().includes(query);
      const matchHandle = c.authorHandle.toLowerCase().includes(query);
      const matchPreview = c.preview.toLowerCase().includes(query);
      const matchLabels = c.labels.some((l) => l.toLowerCase().includes(query));
      if (!matchName && !matchHandle && !matchPreview && !matchLabels) return false;
    }

    return true;
  });

  return filtered.sort((a, b) => {
    if (sort === "priority_desc") {
      const scoreDiff = calculateUrgencyScore(b) - calculateUrgencyScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    }
    if (sort === "oldest") {
      return new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime();
    }
    // newest
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

/**
 * Summary metrics of inbox conversations.
 */
export function calculateInboxMetrics(items: ConversationItem[]): {
  total: number;
  open: number;
  pending: number;
  snoozed: number;
  done: number;
  positive: number;
  neutral: number;
  negative: number;
  highPriority: number;
} {
  let open = 0;
  let pending = 0;
  let snoozed = 0;
  let done = 0;
  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let highPriority = 0;

  for (const c of items) {
    if (c.status === "open") open++;
    else if (c.status === "pending") pending++;
    else if (c.status === "snoozed") snoozed++;
    else if (c.status === "done") done++;

    if (c.sentiment === "positive") positive++;
    else if (c.sentiment === "neutral") neutral++;
    else if (c.sentiment === "negative") negative++;

    if (c.priority >= 2 || c.sentiment === "negative") highPriority++;
  }

  return {
    total: items.length,
    open,
    pending,
    snoozed,
    done,
    positive,
    neutral,
    negative,
    highPriority,
  };
}
