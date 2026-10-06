import type { PlatformKey } from "@/lib/constants";
import { seededRandom } from "@/lib/blog-schedule";

/**
 * Pure helpers behind the generated blog cover art: which colours a category
 * gets, which platform a post is about, and a stable seed per post so a cover
 * never changes between renders but every post still looks different.
 */

export type CoverTheme = { from: string; to: string; accent: string };

const THEMES: Record<string, CoverTheme> = {
  "Platform Guides": { from: "#F0762E", to: "#feb804", accent: "#fff4e0" },
  "Scheduling & Workflow": { from: "#2563eb", to: "#06b6d4", accent: "#e0f7ff" },
  Strategy: { from: "#7c3aed", to: "#ec4899", accent: "#fde7f5" },
  Analytics: { from: "#059669", to: "#14b8a6", accent: "#dcfff5" },
  "AI & Automation": { from: "#4f46e5", to: "#a855f7", accent: "#ede9ff" },
  "Agencies & Teams": { from: "#e11d48", to: "#f59e0b", accent: "#ffe9e4" },
};
const DEFAULT_THEME: CoverTheme = { from: "#F0762E", to: "#feb804", accent: "#fff4e0" };

export function coverTheme(category: string | null | undefined): CoverTheme {
  return THEMES[category ?? ""] ?? DEFAULT_THEME;
}

/** Which platform (if any) a post is about, from its slug/title/keyword. */
export function detectPlatform(text: string): PlatformKey | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const rules: [PlatformKey, RegExp][] = [
    ["bluesky", /\bbluesky\b/],
    ["threads", /\bthreads\b/],
    ["instagram", /\binstagram\b/],
    ["tiktok", /\btiktok\b/],
    ["youtube", /\byoutube\b/],
    ["linkedin", /\blinkedin\b/],
    ["pinterest", /\bpinterest\b/],
    ["facebook", /\bfacebook\b/],
    ["gbp", /\bgoogle business\b/],
    ["x", /\b(twitter|x character|x premium|x post|x twitter)\b/],
  ];
  return rules.find(([, re]) => re.test(t))?.[0] ?? null;
}

/** Small stable hash (FNV-1a) so a slug always maps to the same artwork. */
export function seedFor(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type CoverShape = { x: number; y: number; r: number; o: number; kind: "disc" | "ring" };

/** Decorative background shapes in a 0–100 box, same output for the same seed. */
export function coverShapes(seed: number, count = 6): CoverShape[] {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(rand() * 100),
    y: Math.round(rand() * 100),
    r: Math.round(14 + rand() * 30),
    o: Math.round((0.1 + rand() * 0.22) * 100) / 100,
    kind: i % 3 === 1 ? ("ring" as const) : ("disc" as const),
  }));
}
