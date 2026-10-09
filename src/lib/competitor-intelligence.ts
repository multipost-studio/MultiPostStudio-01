import { UNTRUSTED_NOTE, untrusted } from "@/lib/ai/untrusted";

/**
 * Competitor Intelligence & Benchmarking Logic
 */

export interface VelocityBenchmark {
  followerRatio: number; // your followers as % of competitor's
  frequencyDifference: number; // your posts/wk minus competitor's
  engagementYield: number; // your ER / competitor ER ratio
  status: "leading" | "competitive" | "trailing";
}

export function calculateVelocityBenchmark({
  myFollowers,
  myPostsPerWeek,
  myEr,
  competitor,
}: {
  myFollowers: number;
  myPostsPerWeek: number;
  myEr: number;
  competitor: {
    followerCount: number;
    postsPerWeek: number;
    avgEngagement: number;
  };
}): VelocityBenchmark {
  const followerRatio =
    competitor.followerCount > 0
      ? (myFollowers / competitor.followerCount) * 100
      : 100;

  const frequencyDifference = myPostsPerWeek - competitor.postsPerWeek;

  const engagementYield =
    competitor.avgEngagement > 0
      ? (myEr / competitor.avgEngagement) * 100
      : 100;

  let score = 0;
  if (followerRatio >= 100) score += 2;
  else if (followerRatio >= 70) score += 1;

  if (engagementYield >= 100) score += 2;
  else if (engagementYield >= 80) score += 1;

  if (frequencyDifference >= 0) score += 1;

  const status: "leading" | "competitive" | "trailing" =
    score >= 4 ? "leading" : score >= 2 ? "competitive" : "trailing";

  return {
    followerRatio,
    frequencyDifference,
    engagementYield,
    status,
  };
}

export interface ExtractedTopic {
  keyword: string;
  count: number;
  formats: string[];
}

export function extractCompetitorTopics(
  posts: { caption: string; format: string }[]
): ExtractedTopic[] {
  if (posts.length === 0) return [];

  const stopWords = new Set([
    "the", "and", "this", "that", "with", "from", "your", "have", "more",
    "will", "about", "what", "when", "where", "into", "some", "them",
    "here", "just", "like", "our", "are", "for", "you", "out", "new"
  ]);

  const wordCounts: Record<string, { count: number; formats: Set<string> }> = {};

  for (const post of posts) {
    const tokens = post.caption
      .toLowerCase()
      .replace(/[^\w\s#]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w) && !/^\d+$/.test(w));

    for (const t of tokens) {
      if (!wordCounts[t]) {
        wordCounts[t] = { count: 0, formats: new Set() };
      }
      wordCounts[t].count += 1;
      if (post.format) wordCounts[t].formats.add(post.format);
    }
  }

  return Object.entries(wordCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([keyword, data]) => ({
      keyword,
      count: data.count,
      formats: Array.from(data.formats),
    }));
}

export interface GapAnalysisResult {
  summary: string;
  opportunities: string[];
  threats: string[];
  recommendedAction: string;
}

export function generateGapAnalysis({
  myFollowers,
  myPostsPerWeek,
  myEr,
  competitor,
}: {
  myFollowers: number;
  myPostsPerWeek: number;
  myEr: number;
  competitor: {
    name: string;
    followerCount: number;
    postsPerWeek: number;
    avgEngagement: number;
    posts?: { caption: string; format: string }[];
  };
}): GapAnalysisResult {
  const benchmark = calculateVelocityBenchmark({
    myFollowers,
    myPostsPerWeek,
    myEr,
    competitor,
  });

  const opportunities: string[] = [];
  const threats: string[] = [];

  if (myEr > competitor.avgEngagement) {
    opportunities.push(
      `Your engagement rate (${myEr.toFixed(1)}%) is higher than ${competitor.name} (${competitor.avgEngagement.toFixed(1)}%). Your audience is more responsive.`
    );
  } else {
    threats.push(
      `${competitor.name} generates ${(competitor.avgEngagement - myEr).toFixed(1)}% higher engagement per post. Analyze their top formats to improve hook retention.`
    );
  }

  if (myPostsPerWeek < competitor.postsPerWeek) {
    opportunities.push(
      `Increasing your cadence from ${myPostsPerWeek.toFixed(1)} to ${competitor.postsPerWeek.toFixed(1)} posts/wk could accelerate organic reach.`
    );
  } else {
    opportunities.push(
      `You post more frequently (${myPostsPerWeek.toFixed(1)} vs ${competitor.postsPerWeek.toFixed(1)} posts/wk), preserving consistent algorithm presence.`
    );
  }

  if (competitor.followerCount > myFollowers * 2) {
    threats.push(
      `${competitor.name} has substantial follower scale advantage (${competitor.followerCount.toLocaleString()} vs ${myFollowers.toLocaleString()}).`
    );
  }

  let recommendedAction = "";
  if (benchmark.status === "trailing") {
    recommendedAction = `Prioritize high-value carousels and video formats, and test publishing during non-peak hours to contest ${competitor.name}'s audience.`;
  } else if (benchmark.status === "competitive") {
    recommendedAction = `Double down on your highest performing pillar topics where engagement leads ${competitor.name}, while maintaining consistent weekly cadence.`;
  } else {
    recommendedAction = `Maintain your engagement advantage and expand cross-channel distribution to widen your audience lead over ${competitor.name}.`;
  }

  return {
    summary: `${competitor.name} is currently ${benchmark.status} relative to your performance profile.`,
    opportunities: opportunities.slice(0, 3),
    threats: threats.slice(0, 2),
    recommendedAction,
  };
}

/* ---------------------------------------------------------------- narrative */

export type GapSource = "ai" | "rules";

/** The text stored on the competitor and shown in the UI. It always says which kind of analysis it is. */
export function formatGapSummary(a: GapAnalysisResult, source: GapSource): string {
  const origin = source === "ai" ? "Written by your connected AI model from the numbers above." : "Rule-based comparison of the numbers above (no AI model was used).";
  return `${a.summary}\n\nOpportunities:\n• ${a.opportunities.join("\n• ")}\n\nThreats:\n• ${a.threats.length ? a.threats.join("\n• ") : "None stood out."}\n\nRecommendation:\n${a.recommendedAction}\n\n${origin}`;
}

/** What the model is told. Only real, user-entered figures go in, and it is told not to invent more. */
export function buildGapPrompt(input: {
  myFollowers: number;
  myPostsPerWeek: number;
  myEr: number;
  competitor: { name: string; platform?: string; followerCount: number; postsPerWeek: number; avgEngagement: number; posts?: { caption: string; format: string }[] };
  baseline: GapAnalysisResult;
}): { system: string; user: string } {
  const c = input.competitor;
  const posts = (c.posts ?? [])
    .slice(0, 8)
    .map((p) => `- [${p.format}] ${p.caption.replace(/\s+/g, " ").slice(0, 140)}`)
    .join("\n");
  const safePosts = posts ? untrusted(posts, "competitor posts") : "";
  return {
    system:
      "You are a social media strategist comparing a brand with one competitor. Use ONLY the figures given; never invent numbers, posts or facts. " +
      "Reply in exactly this format and nothing else:\nSUMMARY: one sentence\nOPPORTUNITIES:\n- up to 3 bullets\nTHREATS:\n- up to 2 bullets (or '- none')\nRECOMMENDATION: one or two sentences with a concrete next step\n" + UNTRUSTED_NOTE,
    user:
      `Your brand: ${input.myFollowers.toLocaleString("en-US")} followers, ${input.myPostsPerWeek.toFixed(1)} posts/week, ${input.myEr.toFixed(2)}% engagement rate (last 30 days).\n` +
      `Competitor ${c.name}${c.platform ? ` on ${c.platform}` : ""}: ${c.followerCount.toLocaleString("en-US")} followers, ${c.postsPerWeek.toFixed(1)} posts/week, ${c.avgEngagement.toFixed(2)}% average engagement.\n` +
      `Rule-based verdict: ${input.baseline.summary}\n` +
      (safePosts ? `Competitor posts the user recorded:\n${safePosts}\n` : "No competitor posts were recorded.\n") +
      "Write the comparison.",
  };
}

const bullets = (block: string): string[] =>
  block
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter((l) => l && !/^none\.?$/i.test(l));

/** Parse the model's answer. Null when it is not in the agreed shape, so the caller falls back to the rule-based text. */
export function parseGapNarrative(text: string): GapAnalysisResult | null {
  const t = text.replace(/\r\n/g, "\n");
  // The look-ahead must not require a newline: an empty section leaves the next heading right after the
  // whitespace the heading pattern already consumed.
  const summary = t.match(/SUMMARY:\s*([\s\S]*?)(?=OPPORTUNITIES:|$)/i)?.[1]?.trim();
  const opp = t.match(/OPPORTUNITIES:\s*([\s\S]*?)(?=THREATS:|$)/i)?.[1];
  const thr = t.match(/THREATS:\s*([\s\S]*?)(?=RECOMMENDATION:|$)/i)?.[1];
  const rec = t.match(/RECOMMENDATION:\s*([\s\S]*)$/i)?.[1]?.trim();
  if (!summary || !opp || !rec) return null;
  const opportunities = bullets(opp).slice(0, 3);
  if (opportunities.length === 0) return null;
  return {
    summary: summary.replace(/\s+/g, " ").slice(0, 300),
    opportunities: opportunities.map((o) => o.slice(0, 300)),
    threats: bullets(thr ?? "").slice(0, 2).map((o) => o.slice(0, 300)),
    recommendedAction: rec.replace(/\s+/g, " ").slice(0, 500),
  };
}
