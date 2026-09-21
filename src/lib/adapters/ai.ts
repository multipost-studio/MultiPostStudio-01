// AI adapter. The exported `generate*` functions are deterministic templated
// fallbacks (used in dev / demo / when the LLM call fails). The `*Async`
// variants call Anthropic when ANTHROPIC_API_KEY is set and fall back to the
// templated version otherwise — server actions use these.

import { seededRandom, clamp } from "@/lib/utils";
import { PLATFORMS, type PlatformKey } from "@/lib/constants";
import { env, flags } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Records whether a given call's output actually came from the model.
 *
 * Every `*Async` here silently falls back to the deterministic templated
 * generator when no API key is set or the provider call fails. Callers were
 * billing an AI credit either way and telling the user nothing, so a customer
 * on a deployment with no ANTHROPIC_API_KEY paid credits for output no model
 * ever produced. Pass a trace to find out which happened.
 */
export type AiTrace = { usedModel: boolean };

/**
 * Mark this call as templated and return the templated value.
 *
 * The model may have answered and still be unusable here — empty, or parsed
 * to nothing. What matters for billing is the output the user is handed, so
 * the flag tracks that rather than merely whether a request was sent.
 */
function fellBack<T>(trace: AiTrace | undefined, value: T): T {
  if (trace) trace.usedModel = false;
  return value;
}

async function llm(
  system: string,
  user: string,
  maxTokens = 600,
  trace?: AiTrace,
): Promise<string | null> {
  if (!flags.realAI) return null;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
    // Bound the call: a hung provider must not hold the server action (and
    // the user's request) to the platform timeout. Abort → catch below →
    // deterministic templated fallback, same as any other provider failure.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const res = await client.messages.create(
        {
          model: env.ANTHROPIC_MODEL,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        },
        { signal: ctrl.signal },
      );
      const txt = res.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("\n")
        .trim();
      if (txt && trace) trace.usedModel = true;
      return txt || null;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    logger.error({ err: e }, "anthropic call failed — falling back to templated output");
    return null;
  }
}

export function brandLine(b?: BrandContext, platform?: string): string {
  if (!b) return "";
  const platformTone = platform && b.tones ? b.tones[platform] : undefined;
  const toneDesc = platformTone || b.voice || "clear, human, no fluff";

  const parts = [
    `Brand: ${b.name ?? "the company"}.`,
    `Voice: ${toneDesc}.`,
    b.industry ? `Industry: ${b.industry}.` : "",
    b.brainDigest ? `Brand notes: ${b.brainDigest}` : "",
  ];

  if (b.preferences) {
    if (b.preferences.vocabulary && b.preferences.vocabulary.length > 0) {
      parts.push(`Preferred words: ${b.preferences.vocabulary.slice(0, 15).join(", ")}.`);
    }
    if (b.preferences.avoidWords && b.preferences.avoidWords.length > 0) {
      parts.push(`Words to avoid: ${b.preferences.avoidWords.slice(0, 15).join(", ")}.`);
    }
    if (b.preferences.emojiStyle) {
      parts.push(`Emoji style: ${b.preferences.emojiStyle}.`);
    }
    if (b.preferences.ctaStyle) {
      parts.push(`Call-to-action style: ${b.preferences.ctaStyle}.`);
    }
    if (b.preferences.hashtagStrategy) {
      parts.push(`Hashtag strategy: ${b.preferences.hashtagStrategy}.`);
    }
  }

  return parts.filter(Boolean).join(" ");
}

const lines = (s: string, n?: number) => {
  const arr = s
    .split("\n")
    .map((x) => x.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter(Boolean);
  return n ? arr.slice(0, n) : arr;
};

export type Tone = string;

export interface BrandContext {
  name?: string;
  voice?: string | null;
  industry?: string | null;
  brainDigest?: string | null;
  tones?: Record<string, string> | null;
  preferences?: {
    vocabulary?: string[];
    avoidWords?: string[];
    emojiStyle?: string;
    ctaStyle?: string;
    hashtagStrategy?: string;
  } | null;
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

/* ============================================================
   Async wrappers — real LLM when configured, templated fallback
   ============================================================ */

/**
 * Read the workspace's brand sources and describe how it writes.
 *
 * The synchronous `brandBrainDigest` above is a stub: it takes the first few
 * long words out of each source, picks "approachable and warm" vs "clear and
 * confident" from one regex, and appends the same advice sentence to every
 * workspace. The page calls the result a "learned voice", which it isn't.
 *
 * With a model configured this actually reads the sources. Without one it
 * falls back to the stub, and `trace` reports which happened so the page can
 * say so rather than overclaim.
 */
export async function brandBrainDigestAsync(
  sources: { kind: string; title: string; content: string }[],
  trace?: AiTrace,
): Promise<string> {
  if (sources.length === 0) return fellBack(trace, "");
  // Bounded: brand sources can be whole web pages, and this runs on every
  // add/remove.
  const corpus = sources
    .slice(0, 12)
    .map((s) => `--- ${s.kind}: ${s.title} ---\n${s.content.slice(0, 2000)}`)
    .join("\n\n")
    .slice(0, 12000);

  const real = await llm(
    "You analyse a brand's own writing and produce a short brief that another writer could follow. " +
      "Describe tone, sentence rhythm, vocabulary, recurring themes and any habits (emoji, hashtags, " +
      "calls to action). Ground every claim in the samples — if something isn't evident, leave it out. " +
      "Output 2-4 sentences of prose. No headings, no bullet points, no preamble.",
    `Here are the brand's own materials. Describe how this brand writes.\n\n${corpus}`,
    400,
    trace,
  );
  const text = real?.trim();
  if (text) return text;
  return fellBack(trace, brandBrainDigest(sources));
}

export async function captionsAsync(input: {
  prompt: string;
  platform: PlatformKey;
  tone: Tone;
  brand?: BrandContext;
  count?: number;
}, trace?: AiTrace): Promise<string[]> {
  const n = input.count ?? 3;
  const limit = PLATFORMS[input.platform]?.limit ?? 2200;
  const real = await llm(
    "You are a senior social copywriter. Output ONLY the captions, one per line, no numbering, no preamble, no quotes.",
    `${brandLine(input.brand, input.platform)}\nPlatform: ${input.platform} (max ${limit} chars). Tone: ${input.tone}.\nWrite ${n} distinct, ready-to-post captions for: ${input.prompt}`,
    900,
    trace,
  );
  const out = real ? lines(real, n).map((s) => (s.length > limit ? s.slice(0, limit - 1) + "…" : s)) : [];
  if (out.length) return out;
  return fellBack(trace, generateCaptions(input));
}

export async function hooksAsync(topic: string, count = 5, trace?: AiTrace): Promise<string[]> {
  const real = await llm(
    "You write scroll-stopping opening lines for social posts. Output ONLY the hooks, one per line, under 12 words each, no numbering.",
    `Give ${count} hooks for a post about: ${topic}`,
    400,
    trace,
  );
  const out = real ? lines(real, count) : [];
  if (out.length) return out;
  return fellBack(trace, generateHooks(topic, count));
}

export async function ideasAsync(input: {
  topic: string;
  industry?: string | null;
  count?: number;
}, trace?: AiTrace): Promise<{ title: string; angle: string }[]> {
  const n = input.count ?? 6;
  const real = await llm(
    "You are a content strategist. Output ONLY the ideas, one per line as `concept — format` (format e.g. carousel, short video, story), no numbering.",
    `${input.industry ? `Industry: ${input.industry}. ` : ""}Give ${n} post ideas about: ${input.topic}`,
    500,
    trace,
  );
  if (real) {
    const parsed = lines(real, n).map((l) => {
      const [title, angle] = l.split(/\s+[—-]\s+/);
      return { title: (title ?? l).trim(), angle: (angle ?? "Post").trim() };
    });
    if (parsed.length) return parsed;
  }
  return fellBack(trace, generateIdeas(input));
}

export async function rewriteAsync(input: {
  text: string;
  mode: "shorten" | "expand" | "tone" | "rephrase";
  tone?: Tone;
  platform?: PlatformKey;
}, trace?: AiTrace): Promise<string> {
  const instr = {
    shorten: "Rewrite it about 50% shorter, same meaning.",
    expand: "Expand it with one useful concrete detail, keep the voice.",
    tone: `Rewrite it in a ${input.tone ?? "clearer"} tone.`,
    rephrase: "Rephrase it so it reads fresh but says the same thing.",
  }[input.mode];
  const real = await llm(
    "You are an editor. Output ONLY the rewritten text, nothing else.",
    `${instr}${input.platform ? ` For ${input.platform}.` : ""}\n\nText:\n${input.text}`,
    700,
    trace,
  );
  return real?.trim() || fellBack(trace, rewrite(input));
}

export async function repurposeAsync(input: {
  source: string;
  targets: PlatformKey[];
  brand?: BrandContext;
}, trace?: AiTrace): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  // One templated target makes the whole result templated: the user is handed
  // a mix, and billing it as model output would overstate what they got.
  let anyFallback = false;
  await Promise.all(
    input.targets.map(async (p) => {
      const limit = PLATFORMS[p]?.limit ?? 2200;
      const real = await llm(
        "You are an expert social media copywriter. Adapt the post for the target platform while maintaining the core message and tone. Output ONLY the adapted text, no intro, no explanation.",
        `${brandLine(input.brand, p)}\nAdapt this for ${p} (max ${limit} chars, native format & length):\n\n${input.source}`,
        900,
        trace,
      );
      if (real) {
        results[p] = real.trim().slice(0, limit);
      } else {
        anyFallback = true;
        results[p] = repurpose({ source: input.source, targets: [p], brand: input.brand })[p];
      }
    }),
  );
  if (anyFallback) return fellBack(trace, results);
  return results;
}

export async function blogToPostsAsync(input: { title: string; body: string; count?: number }, trace?: AiTrace): Promise<string[]> {
  const n = input.count ?? 4;
  const real = await llm(
    "You turn long articles into standalone social posts. Output the posts separated by a line containing only '---'. No numbering.",
    `Title: ${input.title}\n\nArticle:\n${input.body.slice(0, 6000)}\n\nWrite ${n} standalone posts, each with a hook and one takeaway.`,
    1200,
    trace,
  );
  if (real) {
    const parts = real
      .split(/^\s*---\s*$/m)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts.slice(0, n);
  }
  return fellBack(trace, blogToPosts(input));
}

export async function replyAsync(input: {
  message: string;
  mode: "draft" | "shorter" | "professional" | "brand";
  brand?: BrandContext;
}, trace?: AiTrace): Promise<string> {
  const real = await llm(
    "You reply to social comments and DMs as a brand. Output ONLY the reply, one short paragraph, no quotes.",
    `${brandLine(input.brand)}\nMode: ${input.mode}.\nIncoming message:\n${input.message}`,
    600,
    trace,
  );
  if (real) return real;
  return fellBack(trace, generateReply(input));
}

export interface SynthesizedBrandVoice {
  voiceSummary: string;
  tones: Record<string, string>;
  preferences: {
    vocabulary: string[];
    avoidWords: string[];
    emojiStyle: string;
    ctaStyle: string;
    hashtagStrategy: string;
  };
}

export async function synthesizeBrandVoice(
  brandName: string,
  sources: Array<{ title: string; content: string; kind: string }>,
  trace?: AiTrace,
): Promise<SynthesizedBrandVoice> {
  const sampleText = sources
    .slice(0, 10)
    .map((s) => `--- SOURCE: ${s.title} (${s.kind}) ---\n${s.content.slice(0, 1500)}`)
    .join("\n\n")
    .slice(0, 10000);

  const system =
    "You are an expert brand voice strategist and social media linguist. Analyze the provided brand materials and extract a cohesive, production-ready brand voice profile with per-platform tone adjustments, vocabulary guidelines, emoji style, and CTA strategy. Output ONLY valid JSON matching this schema: {\"voiceSummary\":\"...\",\"tones\":{\"instagram\":\"...\",\"linkedin\":\"...\",\"x\":\"...\",\"facebook\":\"...\",\"tiktok\":\"...\",\"youtube\":\"...\"},\"preferences\":{\"vocabulary\":[\"...\"],\"avoidWords\":[\"...\"],\"emojiStyle\":\"...\",\"ctaStyle\":\"...\",\"hashtagStrategy\":\"...\"}}";

  const user = `Brand Name: ${brandName}\n\nMaterials:\n${sampleText}\n\nGenerate the complete JSON brand voice profile.`;

  const raw = await llm(system, user, 1000, trace);
  if (raw) {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.voiceSummary && parsed.tones && parsed.preferences) {
          return {
            voiceSummary: String(parsed.voiceSummary).slice(0, 2000),
            tones: {
              instagram: String(parsed.tones.instagram || "Engaging, visual, community-focused, warm"),
              linkedin: String(parsed.tones.linkedin || "Professional, insightful, thought-leadership, authoritative"),
              x: String(parsed.tones.x || "Concise, witty, immediate, punchy"),
              facebook: String(parsed.tones.facebook || "Friendly, relatable, conversational, informative"),
              tiktok: String(parsed.tones.tiktok || "Casual, authentic, playful, hook-driven"),
              youtube: String(parsed.tones.youtube || "Descriptive, engaging, searchable, clear"),
              ...parsed.tones,
            },
            preferences: {
              vocabulary: Array.isArray(parsed.preferences.vocabulary)
                ? parsed.preferences.vocabulary.map(String).slice(0, 20)
                : ["innovative", "authentic", "impactful"],
              avoidWords: Array.isArray(parsed.preferences.avoidWords)
                ? parsed.preferences.avoidWords.map(String).slice(0, 20)
                : ["cheap", "guaranteed", "viral", "synergy"],
              emojiStyle: String(parsed.preferences.emojiStyle || "Curated & strategic — max 1-2 per post"),
              ctaStyle: String(parsed.preferences.ctaStyle || "Clear question or single-action prompt"),
              hashtagStrategy: String(parsed.preferences.hashtagStrategy || "3-5 specific, relevant niche hashtags"),
            },
          };
        }
      }
    } catch (e) {
      logger.error({ err: e }, "Failed to parse synthesized brand voice JSON — falling back to deterministic synthesis");
    }
  }

  // Deterministic fallback (no API key, model failure, or dev/test mode)
  fellBack(trace, null);
  const words = sampleText.match(/\b[A-Za-z]{4,}\b/g) || [];
  const freq: Record<string, number> = {};
  for (const w of words) {
    const lower = w.toLowerCase();
    freq[lower] = (freq[lower] || 0) + 1;
  }
  const topWords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .filter(([w]) => !["this", "that", "with", "from", "your", "have", "will", "been", "were", "they", "what", "when", "more"].includes(w))
    .slice(0, 8)
    .map(([w]) => w);

  return {
    voiceSummary: `${brandName} communicates with an authoritative yet accessible voice, emphasizing clarity, purpose, and community connection.`,
    tones: {
      instagram: "Visual, warm, community-first, lifestyle-oriented",
      linkedin: "Insightful, professional, value-driven, thought leadership",
      x: "Punchy, concise, timely, conversational",
      facebook: "Welcoming, informative, conversational, helpful",
      tiktok: "Fast-paced, authentic, trend-aware, unscripted",
      youtube: "Clear, structured, informative, searchable",
    },
    preferences: {
      vocabulary: topWords.length > 0 ? topWords : ["quality", "growth", "community", "purpose", "momentum"],
      avoidWords: ["cheap", "viral", "guaranteed", "synergy", "paradigm", "ninja", "guru"],
      emojiStyle: "Moderate (1-3 relevant emojis to accent key bullet points)",
      ctaStyle: "Conversational question inviting comments or simple link click",
      hashtagStrategy: "2-4 high-relevance niche hashtags placed at end",
    },
  };
}
