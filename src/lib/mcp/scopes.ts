import { API_SCOPES } from "@/lib/constants";

export type McpScope = (typeof API_SCOPES)[number];

/** What each permission lets an AI assistant do, in words a person can judge on the consent screen. */
export const SCOPE_INFO: Record<McpScope, { label: string; description: string; write: boolean }> = {
  "posts:read": { label: "See your posts", description: "Read drafts, scheduled and published posts and how they did.", write: false },
  "posts:write": { label: "Create and change posts", description: "Save drafts, schedule posts, reschedule them and delete drafts or scheduled posts. It never publishes immediately.", write: true },
  "channels:read": { label: "See your channels", description: "Read which social channels are connected and their posting times.", write: false },
  "analytics:read": { label: "See your analytics", description: "Read totals such as impressions, reach and engagement.", write: false },
  "ideas:read": { label: "See your ideas", description: "Read the ideas on your Ideas board.", write: false },
  "ideas:write": { label: "Add ideas", description: "Add new ideas to your Ideas board.", write: true },
  "templates:read": { label: "See your templates", description: "Read your saved post templates.", write: false },
  "inbox:read": { label: "See your inbox", description: "Read comments and messages waiting in the inbox. It cannot reply.", write: false },
  "media:write": { label: "Upload media", description: "Reserved: no assistant tool uses this yet.", write: true },
  "webhooks:manage": { label: "Manage webhooks", description: "Reserved: no assistant tool uses this yet.", write: true },
};

/** The permissions an assistant can actually use today (the two reserved ones are left out of the consent screen). */
export const ASSISTANT_SCOPES: McpScope[] = [
  "posts:read",
  "channels:read",
  "analytics:read",
  "ideas:read",
  "templates:read",
  "inbox:read",
  "posts:write",
  "ideas:write",
];

/** Pre-ticked on the consent screen and for a new "assistant" key: look, don't touch. */
export const READ_ONLY_SCOPES: McpScope[] = ASSISTANT_SCOPES.filter((s) => !SCOPE_INFO[s].write);

export function parseScopeList(raw: unknown): McpScope[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,]+/) : [];
  const known = new Set<string>(API_SCOPES);
  return [...new Set(list.map(String).filter((s) => known.has(s)))] as McpScope[];
}
