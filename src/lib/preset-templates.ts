/**
 * Built-in starter templates, available in every workspace without seeding.
 * The Templates page renders these above the workspace's own templates;
 * `applyPresetTemplateAction` turns one into a draft. Users can't edit or
 * delete them — to customise, they save their own copy.
 */
export type PresetTemplate = {
  slug: string;
  name: string;
  category: string;
  platforms: string[];
  body: string;
};

const SOCIAL = ["instagram", "facebook", "linkedin", "threads", "bluesky"];
const LONGFORM = ["linkedin", "facebook", "instagram"];
const SHORT = ["threads", "bluesky", "x"];

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    slug: "educational-carousel",
    name: "Educational carousel",
    category: "education",
    platforms: LONGFORM,
    body: `Hook: the one thing about [topic] nobody tells you

1. [Point one — the common mistake]
2. [Point two — what to do instead]
3. [Point three — the result you get]
4. [Point four — a quick example]
5. [Point five — the takeaway]

Save this for the next time you [situation]. ↓

#[topic] #[niche]`,
  },
  {
    slug: "product-launch",
    name: "Product launch",
    category: "promo",
    platforms: SOCIAL,
    body: `[Product] is live. 🚀

We built it because [the problem you kept hearing].

What it does:
• [Benefit one]
• [Benefit two]
• [Benefit three]

Try it: [link]`,
  },
  {
    slug: "founder-story",
    name: "Founder story",
    category: "story",
    platforms: LONGFORM,
    body: `[X months/years] ago I [starting point].

Today [where you are now].

The turning point was [the decision or moment].

What I'd tell someone starting out: [one honest lesson].`,
  },
  {
    slug: "weekly-tips",
    name: "Weekly tips thread",
    category: "education",
    platforms: SHORT,
    body: `5 things I learned about [topic] this week:

1. [Lesson]
2. [Lesson]
3. [Lesson]
4. [Lesson]
5. [Lesson]

Which one do you already do?`,
  },
  {
    slug: "behind-the-scenes",
    name: "Behind the scenes",
    category: "story",
    platforms: SOCIAL,
    body: `Behind the scenes of [what you're making].

[What's actually happening in the photo/video.]

The part people don't see: [the unglamorous reality].

[What ships next / when.]`,
  },
  {
    slug: "customer-spotlight",
    name: "Customer spotlight (UGC)",
    category: "ugc",
    platforms: SOCIAL,
    body: `"[Customer quote about the result they got.]"
— [Name], [role / company]

[One sentence of context on what they were struggling with before.]

Got a story like this? Reply or tag us — we'd love to share it.`,
  },
  {
    slug: "announcement",
    name: "Announcement",
    category: "announcement",
    platforms: SOCIAL,
    body: `New: [what changed].

Why it matters: [the benefit to the reader, in one line].

[Any action they need to take, or "nothing you need to do".]

More detail: [link]`,
  },
  {
    slug: "engagement-question",
    name: "Engagement question",
    category: "general",
    platforms: SOCIAL,
    body: `[A specific, slightly contrarian question about your niche.]

A) [Option one]
B) [Option two]

Drop your pick in the comments — curious where people land.`,
  },
  {
    slug: "myth-vs-fact",
    name: "Myth vs fact",
    category: "education",
    platforms: SOCIAL,
    body: `Myth: [the thing everyone believes about your topic].

Fact: [what's actually true].

Here's why: [2–3 sentences of explanation].

[Takeaway the reader can act on today.]`,
  },
  {
    slug: "limited-time-offer",
    name: "Limited-time offer",
    category: "promo",
    platforms: SOCIAL,
    body: `[Offer] — through [deadline] only.

[What they get, concretely.]

[Who it's for / who it's not for.]

Claim it: [link]`,
  },
  {
    slug: "listicle-roundup",
    name: "Listicle / roundup",
    category: "education",
    platforms: LONGFORM,
    body: `[N] [tools/resources/ideas] for [audience] in [year]:

1. [Item] — [one line on why it's useful]
2. [Item] — [one line]
3. [Item] — [one line]
4. [Item] — [one line]
5. [Item] — [one line]

Bookmark this. Which would you add?`,
  },
  {
    slug: "case-study",
    name: "Case study",
    category: "story",
    platforms: LONGFORM,
    body: `How [customer / we] went from [before state] to [after state] in [timeframe].

The problem: [what wasn't working].
What we changed: [the approach, 2–3 steps].
The result: [the number / outcome].

[The one lesson that transfers to the reader.]`,
  },
];

export function getPresetTemplate(slug: string): PresetTemplate | undefined {
  return PRESET_TEMPLATES.find((t) => t.slug === slug);
}
