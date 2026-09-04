import { db } from "@/lib/db";
import { PLATFORMS, type PlatformKey } from "@/lib/constants";

/**
 * Data-driven post scoring. Builds a model from THIS workspace's own published
 * posts and their real engagement (PostMetric), then scores a draft by how
 * closely it matches what actually worked. No AI, no external API.
 *
 * Cold start (fewer than MIN_HISTORY posts with engagement) → deterministic
 * platform best-practice benchmarks, clearly flagged.
 */

const MIN_HISTORY = 8;

export type Score = {
  engagementScore: number;
  clarityScore: number;
  hookStrength: number;
  readability: number;
  ctaScore: number;
  brandVoiceScore: number;
  platformFitScore: number;
  recommendations: string[];
  basis: "history" | "benchmarks";
};

const clamp = (n: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, Math.round(n)));
const CTA_RE = /(comment|share|save this|follow|link in bio|sign ?up|learn more|\bdm\b|check out|read more|subscribe|register)/i;
const hasCTA = (s: string) => CTA_RE.test(s);
const firstLineLen = (s: string) => (s.split("\n")[0] ?? "").trim().length;
const hashtagCount = (s: string) => (s.match(/#[\p{L}0-9_]+/gu) ?? []).length;
const sentenceCount = (s: string) => s.split(/[.!?]+/).filter((x) => x.trim().length > 3).length;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};
/** 0..99 by how close `val` sits to `target` within tolerance `tol`. */
const proximity = (val: number, target: number, tol: number) =>
  clamp(99 * Math.max(0, 1 - Math.abs(val - target) / Math.max(tol, 1)));

export async function scorePost(
  workspaceId: string,
  draft: { body: string; platform: PlatformKey; hasMedia: boolean },
): Promise<Score> {
  const { body, platform, hasMedia } = draft;
  const limit = PLATFORMS[platform]?.limit ?? 2200;
  const len = body.trim().length;

  const posts = await db.post.findMany({
    where: { workspaceId, status: "published", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 300,
    include: {
      metrics: true,
      channels: { select: { body: true } },
      _count: { select: { media: true, tags: true } },
    },
  });

  const samples = posts
    .map((p) => {
      const m = p.metrics.reduce(
        (a, x) => ({
          imp: a.imp + x.impressions,
          eng: a.eng + x.likes + x.comments + x.shares + x.saves,
        }),
        { imp: 0, eng: 0 },
      );
      const text = p.channels[0]?.body ?? "";
      return {
        text,
        len: text.trim().length,
        firstLine: firstLineLen(text),
        sentences: sentenceCount(text),
        tags: p._count.tags,
        media: p._count.media > 0,
        cta: hasCTA(text),
        question: /\?/.test(text),
        eng: m.eng,
        imp: m.imp,
        engRate: m.imp > 0 ? m.eng / m.imp : m.eng > 0 ? m.eng / 1000 : 0,
      };
    })
    .filter((s) => s.len > 0);

  const withEng = samples.filter((s) => s.eng > 0);
  if (withEng.length < MIN_HISTORY) return benchmarkScore(body, platform, hasMedia, limit, len);

  // Rank by engagement rate when we have impressions for most posts, else raw.
  const useRate = withEng.filter((s) => s.imp > 0).length >= withEng.length / 2;
  const metric = (s: (typeof withEng)[number]) => (useRate ? s.engRate : s.eng);
  const sorted = [...withEng].sort((a, b) => metric(b) - metric(a));
  const top = sorted.slice(0, Math.max(3, Math.ceil(sorted.length / 4)));

  const targetLen = median(top.map((s) => s.len)) || 200;
  const targetFirstLine = median(top.map((s) => s.firstLine)) || 60;
  const targetTags = Math.round(mean(top.map((s) => s.tags)));
  const topCtaRate = mean(top.map((s) => (s.cta ? 1 : 0)));
  const topQRate = mean(top.map((s) => (s.question ? 1 : 0)));
  const targetSentences = Math.max(2, median(top.map((s) => s.sentences)));

  const wMedia = withEng.filter((s) => s.media);
  const woMedia = withEng.filter((s) => !s.media);
  const mediaLift =
    wMedia.length >= 3 && woMedia.length >= 3
      ? mean(wMedia.map(metric)) / Math.max(1e-9, mean(woMedia.map(metric)))
      : 1;

  const draftCta = hasCTA(body);
  const draftQ = /\?/.test(body);

  const hookStrength = proximity(firstLineLen(body), targetFirstLine, Math.max(24, targetFirstLine * 0.6));
  const clarityScore = proximity(len, targetLen, Math.max(60, targetLen * 0.5));
  const readability = proximity(sentenceCount(body), targetSentences, 3);
  const ctaScore = clamp(
    (draftCta ? 60 + topCtaRate * 39 : 60 - topCtaRate * 50) + (draftQ ? topQRate * 10 : -topQRate * 8),
  );

  const overLimit = len > limit;
  const needsMedia = PLATFORMS[platform]?.media === "required";
  let platformFitScore = 85;
  if (overLimit) platformFitScore = 20;
  else if (len > limit * 0.92) platformFitScore = 55;
  if (needsMedia && !hasMedia) platformFitScore = Math.min(platformFitScore, 30);
  if (hasMedia && mediaLift > 1.15) platformFitScore = clamp(platformFitScore + 8);
  platformFitScore = clamp(platformFitScore);

  // Style consistency vs top posts (emoji density, uppercase ratio).
  const styleOf = (t: string) => {
    const letters = t.replace(/\s/g, "").length || 1;
    return {
      emoji: (t.match(/\p{Extended_Pictographic}/gu) ?? []).length / Math.max(1, t.split(/\s+/).length),
      caps: (t.match(/[A-Z]/g) ?? []).length / letters,
    };
  };
  const topStyle = {
    emoji: mean(top.map((s) => styleOf(s.text).emoji)),
    caps: mean(top.map((s) => styleOf(s.text).caps)),
  };
  const ds = styleOf(body);
  const brandVoiceScore = clamp(
    99 - (Math.abs(ds.emoji - topStyle.emoji) * 400 + Math.abs(ds.caps - topStyle.caps) * 300),
  );

  const engagementScore = clamp(
    hookStrength * 0.3 + ctaScore * 0.2 + platformFitScore * 0.25 + clarityScore * 0.15 + readability * 0.1,
  );

  const recs: string[] = [];
  if (overLimit) recs.push(`Over ${PLATFORMS[platform]?.label}'s ${limit}-character limit by ${len - limit}. Trim it.`);
  if (firstLineLen(body) > targetFirstLine * 1.8 || firstLineLen(body) < targetFirstLine * 0.4)
    recs.push(`Your best posts open with ~${Math.round(targetFirstLine)}-character hooks; this one opens with ${firstLineLen(body)}.`);
  if (len > targetLen * 1.6)
    recs.push(`Your top posts average ${Math.round(targetLen)} characters; this is ${len}. Tighten it.`);
  else if (len < targetLen * 0.45)
    recs.push(`Shorter than your usual top posts (~${Math.round(targetLen)} characters) — consider adding detail.`);
  if (topCtaRate > 0.55 && !draftCta)
    recs.push(`${Math.round(topCtaRate * 100)}% of your best posts include a call to action; this one doesn't.`);
  if (mediaLift > 1.3 && !hasMedia)
    recs.push(`Posts with media get about ${mediaLift.toFixed(1)}× the engagement in your history. Attach an image or video.`);
  if (targetTags > 0 && Math.abs(hashtagCount(body) - targetTags) > 3)
    recs.push(`Your top posts use ~${targetTags} hashtags; this has ${hashtagCount(body)}.`);
  if (recs.length === 0)
    recs.push("This lines up well with what performs for your audience. Test an alternate hook as an A/B in your next batch.");

  return {
    engagementScore,
    clarityScore,
    hookStrength,
    readability,
    ctaScore,
    brandVoiceScore,
    platformFitScore,
    recommendations: recs,
    basis: "history",
  };
}

/** Deterministic fallback until the workspace has enough published history. */
function benchmarkScore(
  body: string,
  platform: PlatformKey,
  hasMedia: boolean,
  limit: number,
  len: number,
): Score {
  const firstLine = firstLineLen(body);
  const hasHook = firstLine > 8 && firstLine < 120;
  const cta = hasCTA(body);
  const q = /\?/.test(body);
  const needsMedia = PLATFORMS[platform]?.media === "required";

  const hookStrength = clamp(hasHook ? 74 : 40);
  const clarityScore = clamp(len > 20 && len < limit * 0.7 ? 76 : 52);
  const readability = clamp(sentenceCount(body) >= 2 ? 74 : 58);
  const ctaScore = clamp((cta ? 82 : 46) + (q ? 8 : 0));
  let platformFitScore = len > limit ? 20 : len > limit * 0.92 ? 55 : hasMedia ? 84 : 66;
  if (needsMedia && !hasMedia) platformFitScore = 28;
  platformFitScore = clamp(platformFitScore);
  const brandVoiceScore = 70;
  const engagementScore = clamp(
    hookStrength * 0.3 + ctaScore * 0.2 + platformFitScore * 0.25 + clarityScore * 0.15 + readability * 0.1,
  );

  const recs: string[] = ["General benchmarks — this gets sharper once you've published ~8 posts with metrics."];
  if (!hasHook) recs.push("Lead with a specific, curiosity-driven hook in the first 8–12 words.");
  if (!cta) recs.push("Add one clear call to action — ask a question or tell readers what to do next.");
  if (len > limit * 0.9) recs.push(`Close to ${PLATFORMS[platform]?.label}'s limit. Tighten by ~20% for better completion.`);
  if (needsMedia && !hasMedia) recs.push(`${PLATFORMS[platform]?.label} posts need media. Attach an image or video.`);

  return {
    engagementScore,
    clarityScore,
    hookStrength,
    readability,
    ctaScore,
    brandVoiceScore,
    platformFitScore,
    recommendations: recs,
    basis: "benchmarks",
  };
}
