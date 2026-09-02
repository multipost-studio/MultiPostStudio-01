// Stub AI adapter. Deterministic, offline. Real prompt-shaped inputs, templated
// outputs seeded from input so results are stable and demoable. Swap this module
// for a real LLM client (Anthropic/OpenAI) without touching callers.

import { seededRandom, clamp } from "@/lib/utils";
import { PLATFORMS, type PlatformKey } from "@/lib/constants";

export type Tone = string;

export interface BrandContext {
  name?: string;
  voice?: string | null;
  industry?: string | null;
  brainDigest?: string | null;
}

function pick<T>(arr: T[], seed: string): T {
  return arr[Math.floor(seededRandom(seed) * arr.length)];
}

function score(seed: string, min = 55, max = 95): number {
  return Math.round(min + seededRandom(seed) * (max - min));
}

const HOOKS = [
  "Most people get this wrong:",
  "I wish someone told me this sooner —",
  "Here's what nobody talks about:",
  "Stop scrolling. This matters if you",
  "3 lessons after {n} months of doing this the hard way:",
  "The fastest way to {goal} isn't what you think.",
  "Unpopular opinion:",
  "This one change doubled our results:",
];

const CTAS = [
  "Save this for later ↓",
  "Follow for more like this.",
  "Drop a 🙌 if this resonates.",
  "Which one surprised you? Comment below.",
  "Share this with someone who needs it.",
  "Link in bio for the full breakdown.",
];

const IDEA_SEEDS = [
  "Behind-the-scenes of how we {verb} {thing}",
  "A myth about {topic} — debunked",
  "Our {n}-step framework for {goal}",
  "What we learned from a {topic} mistake",
  "{topic} tools we actually use every week",
  "A day in the life of a {role}",
  "Before / after: {thing}",
  "Answering the #1 question we get about {topic}",
  "Hot take on {topic} (and why we're right)",
  "Customer story: how {persona} used us to {goal}",
];

function fill(t: string, vars: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? k);
}

export function generateCaptions(input: {
  prompt: string;
  platform: PlatformKey;
  tone: Tone;
  brand?: BrandContext;
  count?: number;
}): string[] {
  const { prompt, platform, tone, count = 3 } = input;
  const limit = PLATFORMS[platform]?.limit ?? 2200;
  const topic = prompt.trim() || "your latest update";
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const s = `${prompt}|${platform}|${tone}|${i}`;
    const hook = fill(pick(HOOKS, s + "h"), { n: "6", goal: topic, topic });
    const body =
      tone === "Educational"
        ? `Here's the short version of ${topic}:\n\n1. Start with the outcome you want.\n2. Remove one step that doesn't serve it.\n3. Repeat weekly and measure.`
        : tone === "Bold"
          ? `${topic} is not complicated. People just overthink it. Do the simple thing, consistently, and let the compounding do the rest.`
          : tone === "Funny"
            ? `${topic}, explained by someone who has definitely made every mistake first. You're welcome.`
            : `We've been thinking a lot about ${topic}. The pattern we keep seeing: consistency beats intensity, and clarity beats clever.`;
    const cta = pick(CTAS, s + "c");
    let text = `${hook}\n\n${body}\n\n${cta}`;
    if (text.length > limit) text = text.slice(0, limit - 1).trimEnd() + "…";
    out.push(text);
  }
  return out;
}

export function generateIdeas(input: {
  topic: string;
  industry?: string | null;
  count?: number;
}): { title: string; angle: string }[] {
  const { topic, count = 6 } = input;
  return Array.from({ length: count }, (_, i) => {
    const s = `${topic}|${i}`;
    const title = fill(pick(IDEA_SEEDS, s), {
      verb: pick(["build", "ship", "plan", "test"], s + "v"),
      thing: topic,
      topic,
      n: String(3 + Math.floor(seededRandom(s + "n") * 4)),
      goal: `better ${topic}`,
      role: input.industry ? `${input.industry} marketer` : "social media manager",
      persona: pick(["a solo founder", "a 3-person team", "an agency", "a creator"], s + "p"),
    });
    const angle = pick(
      ["Educational carousel", "Short-form video", "Personal story", "Data / results post", "Contrarian take", "Listicle"],
      s + "a",
    );
    return { title, angle };
  });
}

export function generateHooks(topic: string, count = 5): string[] {
  return Array.from({ length: count }, (_, i) =>
    fill(pick(HOOKS, `${topic}|hook|${i}`), { n: "6", goal: topic, topic }),
  );
}

export function rewrite(input: {
  text: string;
  mode: "shorten" | "expand" | "tone" | "rephrase";
  tone?: Tone;
  platform?: PlatformKey;
}): string {
  const { text, mode, tone } = input;
  const t = text.trim();
  if (!t) return "";
  switch (mode) {
    case "shorten": {
      const first = t.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
      return first.length < t.length ? first : t.slice(0, Math.ceil(t.length * 0.6)).trimEnd() + "…";
    }
    case "expand":
      return `${t}\n\nWhy it matters: this compounds over time. The teams that win here aren't doing more — they're doing the same few things without skipping. Start this week, keep it small, and let the results argue for you.`;
    case "tone":
      return tone === "Professional"
        ? t.replace(/!+/g, ".").replace(/\bgonna\b/gi, "going to")
        : tone === "Friendly"
          ? `${t} 😊`
          : tone === "Bold"
            ? t.toUpperCase().slice(0, 1) + t.slice(1) + " No exceptions."
            : t;
    case "rephrase":
    default:
      return `In other words: ${t[0]?.toLowerCase()}${t.slice(1)}`;
  }
}

export function generateHashtags(topic: string, count = 8): string[] {
  const base = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const extra = ["growth", "marketing", "socialmedia", "strategy", "content", "tips", "smallbusiness", "creators"];
  const tags = [...new Set([...base, ...extra])].slice(0, count);
  return tags.map((t) => "#" + t.replace(/\s/g, ""));
}

export function generateCTAs(topic: string, count = 4): string[] {
  return Array.from({ length: count }, (_, i) => pick(CTAS, `${topic}|cta|${i}`));
}

export function generateAltText(input: { filename: string; context?: string }): string {
  const subject = input.context?.trim() || input.filename.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " ");
  return `Image showing ${subject}, used to illustrate the accompanying post.`;
}

export function generateImageDescription(prompt: string): string {
  return `A clean, modern visual for "${prompt}" — soft lighting, brand-aligned colors, generous negative space, single clear focal point.`;
}

export function repurpose(input: {
  source: string;
  targets: PlatformKey[];
  brand?: BrandContext;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of input.targets) {
    const limit = PLATFORMS[p]?.limit ?? 2200;
    let text = input.source.trim();
    if (p === "x" || p === "threads" || p === "bluesky") {
      text = text.split(/(?<=[.!?])\s+/)[0] ?? text;
    }
    if (p === "linkedin") {
      text = `${text}\n\nWhat's your take? 👇`;
    }
    if (p === "instagram") {
      text = `${text}\n\n${generateHashtags(text.split(/\s+/).slice(0, 3).join(" ")).join(" ")}`;
    }
    if (text.length > limit) text = text.slice(0, limit - 1).trimEnd() + "…";
    out[p] = text;
  }
  return out;
}

export function blogToPosts(input: { title: string; body: string; count?: number }): string[] {
  const { title, body, count = 4 } = input;
  const sentences = body.split(/(?<=[.!?])\s+/).filter((s) => s.length > 30);
  return Array.from({ length: Math.min(count, Math.max(1, sentences.length)) }, (_, i) => {
    const s = sentences[i] ?? title;
    return `${generateHooks(title, 1)[0]}\n\n${s}\n\n(From our post: "${title}")`;
  });
}

export interface Prediction {
  engagementScore: number;
  clarityScore: number;
  hookStrength: number;
  readability: number;
  ctaScore: number;
  brandVoiceScore: number;
  platformFitScore: number;
  recommendations: string[];
}

export function predictPerformance(input: {
  body: string;
  platform: PlatformKey;
  hasMedia: boolean;
  brand?: BrandContext;
}): Prediction {
  const { body, platform, hasMedia } = input;
  const seed = body.slice(0, 80) + platform;
  const len = body.trim().length;
  const limit = PLATFORMS[platform]?.limit ?? 2200;
  const firstLine = body.split("\n")[0] ?? "";
  const hasQuestion = /\?/.test(body);
  const hasCTA = /(comment|share|save|follow|link in bio|sign up|learn more)/i.test(body);
  const hasHook = firstLine.length > 8 && firstLine.length < 120;

  const hookStrength = clamp(score(seed + "hook") + (hasHook ? 8 : -18), 10, 99);
  const clarityScore = clamp(score(seed + "clar") + (len > 20 && len < limit * 0.7 ? 6 : -10), 10, 99);
  const readability = clamp(score(seed + "read") + (body.split(/[.!?]/).length > 2 ? 5 : -5), 10, 99);
  const ctaScore = clamp((hasCTA ? 82 : 44) + (hasQuestion ? 8 : 0) + Math.round(seededRandom(seed + "cta") * 10), 10, 99);
  const brandVoiceScore = clamp(score(seed + "brand", 60, 92), 10, 99);
  const platformFitScore = clamp(
    (hasMedia && PLATFORMS[platform]?.media === "required" ? 88 : hasMedia ? 80 : 58) +
      Math.round(seededRandom(seed + "fit") * 8),
    10,
    99,
  );
  const engagementScore = Math.round(
    hookStrength * 0.3 + ctaScore * 0.2 + platformFitScore * 0.25 + clarityScore * 0.15 + brandVoiceScore * 0.1,
  );

  const recommendations: string[] = [];
  if (!hasHook) recommendations.push("Your opening line is weak. Lead with a specific, curiosity-driven hook in the first 8–12 words.");
  if (!hasCTA) recommendations.push("Add one clear call to action — ask a question or tell readers what to do next.");
  if (len > limit * 0.9) recommendations.push(`This is close to ${PLATFORMS[platform]?.label}'s limit. Tighten it by ~20% for better completion.`);
  if (!hasMedia && PLATFORMS[platform]?.media === "required") recommendations.push(`${PLATFORMS[platform]?.label} posts need media. Attach an image or video.`);
  if (recommendations.length === 0) recommendations.push("Solid post. Consider testing an alternate hook as an A/B in your next batch.");

  return {
    engagementScore,
    clarityScore,
    hookStrength,
    readability,
    ctaScore,
    brandVoiceScore,
    platformFitScore,
    recommendations,
  };
}

export function generateReply(input: {
  message: string;
  mode: "draft" | "shorter" | "professional" | "brand";
  brand?: BrandContext;
}): string {
  const m = input.message.trim();
  const negative = /(bad|broken|refund|angry|worst|disappointed|cancel|slow|bug)/i.test(m);
  if (input.mode === "shorter") return negative ? "So sorry about this — DMing you now to fix it." : "Thanks so much! 🙌";
  if (input.mode === "professional")
    return negative
      ? "We're sorry for the trouble. Could you share a few details via DM so our team can resolve this quickly?"
      : "Thank you for the kind words — we really appreciate you taking the time to share this.";
  if (input.mode === "brand")
    return negative
      ? `We hear you, and that's not the experience we want. We've flagged this to the team and will follow up directly.`
      : `Love to see this. Thanks for being part of the ${input.brand?.name ?? "community"} 💜`;
  return negative
    ? "Really sorry about that — this isn't up to our usual standard. Can you DM us your account email so we can dig in and make it right?"
    : "Appreciate you! Let us know if there's anything we can help with.";
}

export function detectSentiment(text: string): "positive" | "neutral" | "negative" {
  if (/(love|great|amazing|thank|awesome|best|helpful|perfect)/i.test(text)) return "positive";
  if (/(bad|broken|refund|angry|worst|hate|disappointed|slow|bug|cancel)/i.test(text)) return "negative";
  return "neutral";
}

export function brandBrainDigest(sources: { kind: string; title: string; content: string }[]): string {
  if (sources.length === 0) return "";
  const topics = new Set<string>();
  for (const s of sources) {
    for (const w of s.content.toLowerCase().match(/\b[a-z]{6,}\b/g)?.slice(0, 8) ?? []) topics.add(w);
  }
  return `Brand voice appears ${sources.some((s) => /casual|fun|friendly/i.test(s.content)) ? "approachable and warm" : "clear and confident"}. Recurring themes: ${[...topics].slice(0, 6).join(", ")}. Prefer concrete examples over abstractions; short paragraphs; end with a light call to action.`;
}

export function generateInsights(input: {
  workspaceName: string;
  topFormat: string;
  bestHour: number;
  growthTrend: number;
}): { category: string; severity: string; what: string; why: string; action: string; metricDelta: number }[] {
  const { topFormat, bestHour, growthTrend } = input;
  const h = bestHour % 12 || 12;
  const ampm = bestHour < 12 ? "AM" : "PM";
  return [
    {
      category: "format",
      severity: "positive",
      what: `Your ${topFormat} posts generate 42% more saves than other formats.`,
      why: `Saves correlate with reference value — ${topFormat} content is being bookmarked to revisit.`,
      action: `Shift 1–2 slots per week toward ${topFormat}. Batch-produce 4 for next month.`,
      metricDelta: 42,
    },
    {
      category: "timing",
      severity: "info",
      what: `Engagement peaks around ${h} ${ampm} on weekdays.`,
      why: "That's when your audience is most active based on the last 30 days of interactions.",
      action: `Move your top-priority posts into the ${h} ${ampm} slot and let the AI scheduler fill the rest.`,
      metricDelta: 18,
    },
    {
      category: "performance",
      severity: growthTrend >= 0 ? "positive" : "warning",
      what: `Follower growth is ${growthTrend >= 0 ? "up" : "down"} ${Math.abs(growthTrend).toFixed(1)}% vs the previous period.`,
      why:
        growthTrend >= 0
          ? "Video content is outpacing static posts and pulling in new reach."
          : "Posting cadence dropped below 4/week and reach followed it down.",
      action:
        growthTrend >= 0
          ? "Double down on video — aim for 3 per week."
          : "Rebuild to a steady 5 posts/week using the queue and evergreen recycling.",
      metricDelta: growthTrend,
    },
  ];
}
