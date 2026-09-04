/**
 * Real trend data — pulled live from Hacker News and Reddit's public JSON
 * endpoints. No API key, no LLM. Titles + scores become Trend rows; the
 * "suggestion" is a deterministic content-angle scaffold, not generated copy.
 */

const UA = "multipost-studio/1.0 (trend refresh)";

export type RawTrend = {
  topic: string;
  category: "topic" | "format" | "keyword" | "industry";
  score: number; // raw upvotes / points
  source: string; // "Hacker News" | "r/<sub>"
  url: string;
};

const DEFAULT_SUBS = [
  "socialmedia",
  "marketing",
  "content_marketing",
  "Entrepreneur",
  "smallbusiness",
];

async function fromHackerNews(limit = 15): Promise<RawTrend[]> {
  try {
    const ids: number[] = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
      cache: "no-store",
    }).then((r) => r.json());
    const top = ids.slice(0, limit);
    const items = await Promise.all(
      top.map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ),
    );
    return items
      .filter((i): i is { title: string; score: number; id: number } => !!i?.title)
      .map((i) => ({
        topic: i.title.trim(),
        category: "topic" as const,
        score: i.score ?? 0,
        source: "Hacker News",
        url: `https://news.ycombinator.com/item?id=${i.id}`,
      }));
  } catch {
    return [];
  }
}

async function fromSubreddit(sub: string, limit = 8): Promise<RawTrend[]> {
  try {
    const data = await fetch(
      `https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=week&limit=${limit}`,
      { headers: { "user-agent": UA }, cache: "no-store" },
    ).then((r) => r.json());
    const children: { data: { title: string; ups: number; permalink: string; stickied?: boolean } }[] =
      data?.data?.children ?? [];
    return children
      .filter((c) => c.data?.title && !c.data.stickied)
      .map((c) => ({
        topic: c.data.title.trim(),
        category: "industry" as const,
        score: c.data.ups ?? 0,
        source: `r/${sub}`,
        url: `https://www.reddit.com${c.data.permalink}`,
      }));
  } catch {
    return [];
  }
}

/** A short, deterministic content angle for a headline — a prompt, not copy. */
function angleFor(topic: string): string {
  const t = topic.replace(/\s+/g, " ").trim();
  if (/\?$/.test(t)) return `Answer this for your audience: "${t}"`;
  if (/^(how|why|what|when|the)\b/i.test(t)) return `Break down "${t}" and what it means for your audience.`;
  return `Share your take on: "${t}" — where do you agree or push back?`;
}

export async function fetchTrends(subs: string[] = DEFAULT_SUBS): Promise<
  { topic: string; category: string; momentum: number; summary: string; suggestion: string }[]
> {
  const [hn, ...reddit] = await Promise.all([fromHackerNews(), ...subs.map((s) => fromSubreddit(s))]);
  const all: RawTrend[] = [hn, ...reddit].flat();
  if (all.length === 0) return [];

  // Dedupe by lowercased topic, keep the highest-scoring copy.
  const byTopic = new Map<string, RawTrend>();
  for (const t of all) {
    const k = t.topic.toLowerCase();
    if (!byTopic.has(k) || (byTopic.get(k)!.score < t.score)) byTopic.set(k, t);
  }
  const deduped = [...byTopic.values()].sort((a, b) => b.score - a.score).slice(0, 24);

  const max = Math.max(...deduped.map((t) => t.score), 1);
  return deduped.map((t) => ({
    topic: t.topic.length > 140 ? t.topic.slice(0, 137) + "…" : t.topic,
    category: t.category,
    momentum: Math.max(1, Math.round((t.score / max) * 100)),
    summary: `${t.source} · ${t.score.toLocaleString()} points`,
    suggestion: angleFor(t.topic),
  }));
}
