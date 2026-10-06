/**
 * The launch batch: long-form posts written for SEO / AEO / GEO, bundled from
 * `src/content/blog-launch/*.md` by `npm run blog:build` into
 * `src/content/blog-launch/posts.generated.ts`. The admin schedules them from
 * Admin → Blog → Import. Kept as a module (not read from disk) so it ships with
 * the server bundle on any host.
 */

export type LaunchPost = {
  /** 1-based position in the editorial plan. */
  order: number;
  slug: string;
  title: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  secondaryKeywords: string;
  category: string;
  tags: string[];
  readMins: number;
  /** Markdown body. */
  content: string;
};

export const LAUNCH_AUTHOR = { name: "MultiPost Studio Team", slug: "multipost-studio-team", role: "Editorial team" } as const;

export async function loadLaunchPosts(): Promise<LaunchPost[]> {
  const mod = await import("@/content/blog-launch/posts.generated");
  return [...mod.BLOG_LAUNCH_POSTS].sort((a, b) => a.order - b.order);
}

export type LaunchProblem = { slug: string; problem: string };

/** Content checks shared by the generator and the tests. */
export function checkLaunchPost(p: LaunchPost): string[] {
  const out: string[] = [];
  const words = p.content.trim().split(/\s+/).length;
  if (words < 800) out.push(`only ${words} words`);
  if (/^#\s/m.test(p.content)) out.push("contains an H1");
  if (p.seoTitle.length > 60) out.push(`seoTitle is ${p.seoTitle.length} chars`);
  if (p.seoDescription.length < 120 || p.seoDescription.length > 160) out.push(`seoDescription is ${p.seoDescription.length} chars`);
  if (p.excerpt.length < 80 || p.excerpt.length > 200) out.push(`excerpt is ${p.excerpt.length} chars`);
  if (!p.focusKeyword) out.push("no focus keyword");
  else {
    // "user-generated" and "user generated" are the same phrase to a reader and a search engine.
    const norm = (s: string) => s.toLowerCase().replace(/-/g, " ");
    const kw = norm(p.focusKeyword);
    if (!norm(p.seoTitle).includes(kw)) out.push("focus keyword missing from seoTitle");
    const first100 = norm(p.content.trim().split(/\s+/).slice(0, 100).join(" "));
    if (!first100.includes(kw)) out.push("focus keyword missing from first 100 words");
  }
  if (!/^## Frequently asked questions/im.test(p.content)) out.push("no FAQ section");
  if ((p.content.match(/^### .+\?\s*$/gm) ?? []).length < 3) out.push("fewer than 3 FAQ questions");
  if (!/^## Key takeaways/im.test(p.content)) out.push("no Key takeaways");
  return out;
}
