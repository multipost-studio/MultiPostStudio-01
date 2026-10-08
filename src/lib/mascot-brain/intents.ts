import { HELP_TOPICS, type HelpTopic } from "./kb";

/**
 * Understands a typed question without a model: normalise, stem, then score the
 * words against a small table of intents, the app's pages and the help topics.
 * Deterministic, instant, free and testable. When nothing scores confidently it
 * says so and offers suggestions instead of bluffing.
 */

export type IntentId =
  | "briefing"
  | "today"
  | "tomorrow"
  | "week"
  | "failed"
  | "best_time"
  | "streak"
  | "approvals"
  | "inbox"
  | "accounts"
  | "usage"
  | "health"
  | "performance"
  | "create"
  | "navigate"
  | "help"
  | "greeting"
  | "thanks"
  | "unknown";

export type RouteEntry = { label: string; href: string; aliases?: string[] };

export type ParsedIntent = {
  intent: IntentId;
  /** 0..1. Below ~0.45 the answer should offer suggestions rather than assert. */
  confidence: number;
  route?: RouteEntry;
  topic?: HelpTopic;
  /** Related things the user may have meant, for "Did you mean...?" chips. */
  suggestions: string[];
};

/* ----------------------------- normalisation ----------------------------- */

const STOP = new Set([
  "the", "a", "an", "is", "are", "was", "were", "do", "does", "did", "i", "my", "me", "mine", "to", "of", "for", "in", "on", "at", "and", "or", "it", "its", "this", "that", "please", "can", "could", "you", "would", "like", "about", "with", "be", "have", "has", "there", "any", "some", "just", "so", "if", "we", "our", "us", "now", "right", "got", "get", "show", "tell", "give", "let", "want", "need",
]);

export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("es") && /(ch|sh|x|s|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

/** Lower-case words with punctuation removed. Apostrophes vanish (what's -> whats, didn't -> didnt). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/'/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Meaningful stems: stop words removed. */
export function terms(text: string): string[] {
  return words(text).filter((w) => !STOP.has(w)).map(stem);
}

const flat = (text: string) => words(text).join(" ");

/* -------------------------------- scoring -------------------------------- */

// `strong` stems are specific enough to decide an intent alone; `weak` ones need company.
// Phrases are matched against the flattened sentence and are the most reliable signal.
type Rule = { id: IntentId; strong: string[]; weak?: string[]; phrases?: string[] };

const RULES: Rule[] = [
  { id: "briefing", strong: ["briefing", "brief", "summary", "summarize", "urgent", "priority", "todo", "focus", "attention"], phrases: ["what should i do", "where do i start", "catch me up", "what's new", "what needs", "anything i should", "how am i doing today", "what's up"] },
  { id: "failed", strong: ["fail", "failure", "error", "broke", "retry"], weak: ["stuck", "rejected"], phrases: ["didn't publish", "did not publish", "not publish", "wasn't published", "went wrong", "couldn't publish", "unable to publish"] },
  { id: "best_time", strong: ["optimal", "peak"], phrases: ["best time", "when should i post", "when to post", "best day", "best hour", "good time to post", "right time to post"] },
  { id: "streak", strong: ["streak", "milestone", "consistency"], phrases: ["posting streak", "daily streak"] },
  { id: "approvals", strong: ["approval", "approve", "awaiting"], weak: ["sign"], phrases: ["waiting for review", "needs review", "pending review", "to review", "my review"] },
  { id: "inbox", strong: ["inbox", "dm", "unread", "reply", "repl", "conversation", "mention"], weak: ["comment", "message"], phrases: ["need a reply", "needs a reply"] },
  { id: "accounts", strong: ["token", "expire", "reconnect", "disconnect"], weak: ["account", "connection", "channel", "connected"], phrases: ["connected accounts", "which accounts", "accounts connected", "are my accounts"] },
  { id: "usage", strong: ["credit", "quota", "usage", "storage"], weak: ["limit", "upgrade", "plan"], phrases: ["how many credits", "credits left", "ai credits", "plan limit", "how much have i used", "running out"] },
  { id: "health", strong: ["health"], phrases: ["health score", "social health"] },
  { id: "performance", strong: ["performance", "analytic", "metric"], weak: ["follower", "reach", "engagement", "growth", "grow", "stat"], phrases: ["how am i doing", "how's my", "how is my", "doing this week", "this week doing"] },
  { id: "create", strong: ["compose", "draft"], weak: ["create", "write", "idea"], phrases: ["new post", "make a post", "start a post", "write a post", "create a post", "post about"] },
  { id: "greeting", strong: ["hi", "hello", "hey", "yo", "sup", "hiya"], phrases: ["good morning", "good afternoon", "good evening"] },
  { id: "thanks", strong: ["thanks", "thank", "cheers", "thx", "ty"], phrases: ["thank you", "appreciate it"] },
];

const SCHEDULE_WORDS = ["schedule", "scheduled", "post", "publish", "queue", "lined", "planned", "going", "plan", "content"];
const NEGATIONS = ["didnt", "not", "cant", "wont", "couldnt", "wasnt", "never", "isnt", "unable", "doesnt", "dont"];

const STRONG = 2.4;
const WEAK = 1.2;

function ruleScore(rule: Rule, ts: Set<string>, sentence: string): number {
  let s = 0;
  for (const k of rule.strong) if (ts.has(stem(k))) s += STRONG;
  for (const k of rule.weak ?? []) if (ts.has(stem(k))) s += WEAK;
  for (const p of rule.phrases ?? []) if (sentence.includes(flat(p))) s += 2.6;
  return s;
}

/* -------------------------------- routing -------------------------------- */

const ROUTE_ALIASES: Record<string, string[]> = {
  "/dashboard": ["home", "main", "start page"],
  "/composer": ["compose", "editor", "write a post"],
  "/calendar": ["planner", "schedule view", "content calendar"],
  "/queue": ["publish queue", "pipeline"],
  "/inbox": ["messages", "dms", "direct messages"],
  "/analytics": ["analytics", "stats", "metrics", "numbers"],
  "/analytics/content": ["post performance", "top posts"],
  "/analytics/audience": ["followers", "demographics"],
  "/integrations": ["connect", "accounts", "channels", "platforms", "connections"],
  "/media": ["images", "videos", "library", "uploads", "assets"],
  "/recycling": ["evergreen", "recycle"],
  "/team": ["members", "invite", "teammates", "users"],
  "/settings/billing": ["billing", "invoices", "payment", "subscription", "pricing", "plan"],
  "/settings/security": ["password", "2fa", "two factor", "security"],
  "/settings/notifications": ["notification settings", "alerts"],
  "/settings/brand": ["brand voice", "brand"],
  "/settings/ai": ["ai key", "ai keys", "byok"],
  "/settings/api": ["api", "api keys"],
  "/settings/webhooks": ["webhooks"],
  "/settings/support": ["support", "contact support", "help"],
  "/settings/profile": ["profile", "my account"],
  "/settings/privacy": ["privacy", "my data"],
  "/insights": ["ai insights", "recommendations"],
  "/insights/streak": ["streak"],
};

export function withAliases(routes: RouteEntry[]): RouteEntry[] {
  return routes.map((r) => ({ ...r, aliases: [...(r.aliases ?? []), ...(ROUTE_ALIASES[r.href] ?? [])] }));
}

const NAV_VERBS = new Set(["go", "open", "take", "navigate", "visit", "bring", "jump", "head", "switch", "launch", "where"]);

function routeScore(route: RouteEntry, ts: Set<string>, sentence: string): number {
  const names = [route.label, ...(route.aliases ?? [])];
  let best = 0;
  for (const n of names) {
    const flatName = flat(n);
    if (!flatName) continue;
    if (sentence === flatName) return 3;
    const nt = terms(n);
    if (nt.length === 0) continue;
    const hit = nt.filter((t) => ts.has(t)).length;
    if (hit === nt.length) best = Math.max(best, 1.6 + nt.length * 0.4);
    else if (hit > 0 && nt.length > 1) best = Math.max(best, 0.5 * hit);
  }
  return best;
}

/* -------------------------------- help KB -------------------------------- */

function topicScore(topic: HelpTopic, ts: Set<string>, sentence: string): number {
  let s = 0;
  for (const k of topic.keywords) {
    const flatK = flat(k);
    if (flatK.includes(" ")) {
      if (sentence.includes(flatK)) s += 2.2;
    } else if (ts.has(stem(flatK))) s += 1.3;
  }
  return s;
}

/* -------------------------------- parsing -------------------------------- */

const HELP_STARTS = /^(how (do|can|should|would|to)|how to|where (do|can|is|are)|can i|can you|is it possible|what is|what are|what does|explain|help|i dont know how|why cant)/;

export function parseIntent(raw: string, routesIn: RouteEntry[], topics: HelpTopic[] = HELP_TOPICS): ParsedIntent {
  const sentence = flat(raw);
  const ts = new Set(terms(raw));
  if (!sentence) return { intent: "unknown", confidence: 0, suggestions: [] };

  const routes = withAliases(routesIn);
  const scores = new Map<IntentId, number>(RULES.map((r) => [r.id, ruleScore(r, ts, sentence)]));
  const bump = (id: IntentId, by: number) => scores.set(id, (scores.get(id) ?? 0) + by);

  // Schedule questions: "what's scheduled today / tomorrow / this week".
  const asksSchedule = SCHEDULE_WORDS.some((w) => ts.has(stem(w)));
  const mentionsToday = ts.has("today") || ts.has("tonight");
  const mentionsTomorrow = ts.has("tomorrow");
  const futureWeek = sentence.includes("next week") || sentence.includes("coming") || sentence.includes("upcoming") || sentence.includes("next 7 days");
  const mentionsWeek = ts.has("week") || futureWeek;
  if (mentionsTomorrow) bump("tomorrow", 3);
  else if (mentionsWeek && (asksSchedule || futureWeek)) bump("week", 3 + (asksSchedule ? 1 : 0));
  else if (mentionsToday && asksSchedule) bump("today", 3.6);
  else if (mentionsToday) bump("briefing", 1.2); // "anything today?" is a catch-up request
  if (sentence.includes("go out") || sentence.includes("going out") || sentence.includes("lined up")) bump("today", 1.5);

  // "Why didn't my post publish" has the negation between the words a phrase would need.
  if (ts.has("publish") && words(raw).some((w) => NEGATIONS.includes(w))) bump("failed", 2.6);

  const bestRoute = routes.map((r) => ({ r, s: routeScore(r, ts, sentence) })).sort((a, b) => b.s - a.s)[0];
  const bestTopic = topics.map((t) => ({ t, s: topicScore(t, ts, sentence) })).sort((a, b) => b.s - a.s)[0];
  const startsHelp = HELP_STARTS.test(sentence);
  const hasNavVerb = words(raw).some((w) => NAV_VERBS.has(w));

  const ranked = [...scores.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const [topId, topScore] = ranked[0] ?? (["unknown", 0] as [IntentId, number]);

  // Greetings and thanks only when they are essentially the whole message.
  if ((topId === "greeting" || topId === "thanks") && ts.size <= 3) return { intent: topId, confidence: 0.95, suggestions: [] };

  const suggestions = buildSuggestions(routes, topics, ts, bestRoute, bestTopic);
  const exactPage = !!bestRoute && bestRoute.s >= 3; // the whole message is a page name ("inbox", "calendar")

  // "How do I connect Instagram?" is help, even though it mentions accounts.
  if (startsHelp && bestTopic && bestTopic.s >= 1.3 && topScore < 3.5) {
    return { intent: "help", confidence: Math.min(1, 0.55 + bestTopic.s / 6), topic: bestTopic.t, suggestions };
  }
  // "Open the calendar", or just "calendar".
  if (bestRoute && bestRoute.s >= 1.6 && (hasNavVerb || exactPage)) {
    return { intent: "navigate", confidence: Math.min(1, 0.5 + bestRoute.s / 5), route: bestRoute.r, suggestions };
  }
  if (topScore >= 2.2) {
    return { intent: topId, confidence: Math.min(1, 0.45 + topScore / 8), suggestions };
  }
  if (bestTopic && bestTopic.s >= 2) return { intent: "help", confidence: Math.min(0.8, 0.4 + bestTopic.s / 6), topic: bestTopic.t, suggestions };
  if (bestRoute && bestRoute.s >= 1.6) return { intent: "navigate", confidence: Math.min(0.8, 0.4 + bestRoute.s / 5), route: bestRoute.r, suggestions };
  return { intent: "unknown", confidence: 0.1, suggestions };
}

function buildSuggestions(
  routes: RouteEntry[],
  topics: HelpTopic[],
  ts: Set<string>,
  bestRoute?: { r: RouteEntry; s: number },
  bestTopic?: { t: HelpTopic; s: number },
): string[] {
  const out: string[] = [];
  if (bestTopic && bestTopic.s > 0) out.push(bestTopic.t.title);
  if (bestRoute && bestRoute.s > 0.4) out.push(`Open ${bestRoute.r.label}`);
  // Partial overlaps with other topics.
  for (const t of topics) {
    if (out.length >= 3) break;
    if (!out.includes(t.title) && topicScore(t, ts, "") > 0) out.push(t.title);
  }
  return out.slice(0, 3);
}

/** Starter questions shown before the user types anything. */
export const STARTER_QUESTIONS = [
  "What should I focus on today?",
  "What's scheduled today?",
  "Any failed posts?",
  "When is the best time to post?",
  "How am I doing this week?",
];
