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
