import type { PlatformKey } from "@/lib/constants";

/**
 * SEO platform pages — the public capability story per network.
 * The capability TABLE on each page is derived live from
 * src/lib/social/capabilities.ts (single source of truth); the copy here
 * is positioning + honest limitations only. If the product gains support,
 * update capabilities.ts and the note below — never hard-code a matrix here.
 */

export type PlatformSeo = {
  slug: string;
  key: PlatformKey;
  tagline: string;
  /** Direct answer: what scheduling/publishing this platform gets (2–3 sentences). */
  answer: string;
  intro: string;
  bestFor: string[];
  /** Account type required, in plain words. */
  accountNote: string;
  faqs: { q: string; a: string }[];
  related: string[];
};

const CONNECT_STEPS = [
  "Open Integrations in your MultiPost Studio workspace and pick the platform.",
  "Authorize MultiPost Studio on the platform's own login screen — credentials never touch our servers.",
  "Choose which profile, Page, channel or location to attach.",
  "Set the channel's queue slots from your engagement data.",
  "Draft once in the composer — the variant is checked against that platform's limits before it schedules.",
];

export const PLATFORM_SEO: PlatformSeo[] = [
  {
    slug: "instagram",
    key: "instagram",
    tagline: "Feed posts, carousels, Reels and Stories from one queue.",
    answer:
      "MultiPost Studio schedules and publishes Instagram feed posts, carousels (2–10 cards), Reels and Stories through the official API. Captions up to 2,200 characters, first comments attached automatically, and every variant previewed before it goes out.",
    intro:
      "Instagram rewards consistency across formats — and punishes tab-switching. Plan feed posts, carousels and Reels on one calendar, attach the first comment with its hashtags, and let per-channel queue slots post when your audience is actually online.",
    bestFor: ["Creators batching a week of content", "Brands running carousels + Reels together", "Agencies managing client grids"],
    accountNote: "Needs an Instagram Business or Creator account linked to a Facebook Page — a Meta API requirement, not ours.",
    faqs: [
      { q: "Can I schedule Instagram Reels?", a: "Yes — vertical video up to 90 seconds publishes through the API, with the caption and first comment attached." },
      { q: "Do carousels publish with all slides?", a: "Yes, 2–10 images or video cards per carousel in 1:1 or 4:5. The composer blocks the schedule if a card breaks the ratio." },
      { q: "What about Stories?", a: "Stories publish via the content API. Interactive stickers, polls and link stickers aren't available to any third-party tool." },
      { q: "Are first comments automated?", a: "Yes. Write the first comment in the composer and it goes out with the post — hashtags included, caption kept clean." },
    ],
    related: ["tiktok", "facebook", "pinterest"],
  },
  {
    slug: "facebook",
    key: "facebook",
    tagline: "Posts, photos, video and Reels for Pages.",
    answer:
      "MultiPost Studio publishes Facebook feed posts, photo posts (up to 10 images), native video and Reels to Pages through the API, with effectively no caption limit (63,206 characters). Stories are the one exception — Meta doesn't open them to third-party apps.",
    intro:
      "Facebook Pages still drive discovery for local businesses and communities. Draft long-form updates, photo sets and Reels once, preview them as the Page sees them, and queue them into the same calendar as every other network.",
    bestFor: ["Small businesses posting to their Page", "Agencies running client Pages", "Video-first Pages repurposing Reels"],
    accountNote: "Connects via a Facebook Page you admin — personal profiles can't publish through any third-party tool.",
    faqs: [
      { q: "Can I schedule Facebook Reels?", a: "Yes — vertical video up to 90 seconds, published natively to the Page." },
      { q: "Is there a caption limit?", a: "Effectively no: 63,206 characters. If your draft is longer than that, the problem is the draft." },
      { q: "Why can't I post Stories?", a: "Meta's API doesn't expose Story publishing to third-party apps. Any tool claiming otherwise is posting manually." },
      { q: "Do scheduled posts look different from manual ones?", a: "No — they publish natively to the Page, identical to posting by hand." },
    ],
    related: ["instagram", "linkedin", "google-business-profile"],
  },
  {
    slug: "linkedin",
    key: "linkedin",
    tagline: "Text-first thought leadership on a schedule.",
    answer:
      "MultiPost Studio publishes LinkedIn text posts (up to 3,000 characters) from the queue with UTM tagging and first comments. Media attachments are not sent yet — text posts publish for real today, image and video posts don't.",
    intro:
      "LinkedIn rewards plain-spoken text posts with a clear point of view. Draft them in the composer, score the hook before scheduling, and keep a steady cadence without living on the LinkedIn tab.",
    bestFor: ["Founders building in public", "B2B teams running employee voices", "Agencies ghostwriting for clients"],
    accountNote: "Connects to a LinkedIn member profile or organization Page via LinkedIn login.",
    faqs: [
      { q: "Can I schedule posts with images?", a: "Not yet — media upload for LinkedIn isn't implemented, and attachments are blocked at validation rather than silently dropped. Text posts publish fully." },
      { q: "What is the character limit?", a: "3,000 characters per post. The composer counts down live." },
      { q: "Can I publish LinkedIn articles?", a: "No — LinkedIn's article API isn't open to third-party apps. Post the link with a strong lead-in instead." },
      { q: "Do you support first comments?", a: "Yes — attach a first comment for the discussion prompt while the post carries the argument." },
    ],
    related: ["x", "facebook", "threads"],
  },
  {
    slug: "x",
    key: "x",
    tagline: "Short posts and threads, timed to the conversation.",
    answer:
      "MultiPost Studio publishes X posts and blank-line-separated threads (280 characters each) through the API. Writing to X needs a paid X API tier on the connected app, and media attachments are not sent yet.",
    intro:
      "X moves fast, which is exactly why it should be scheduled: write threads when you think them, publish them when the timeline is awake. Drafts are split into posts automatically and counted live against the 280-character limit.",
    bestFor: ["Founders live-posting ideas as threads", "News-driven brands", "Anyone repurposing long posts into threads"],
    accountNote: "Requires a paid X API tier on the connected X app — X charges for write access, and no scheduler can bypass that.",
    faqs: [
      { q: "How do threads work?", a: "Separate each post with a blank line. Every block is counted against 280 characters and published as one thread." },
      { q: "Why does X need a paid API tier?", a: "X charges apps for write access. Read the current X developer pricing before connecting — the requirement comes from X, not from us." },
      { q: "Can I attach images or video?", a: "Not yet — media upload for X isn't implemented. Text and threads publish fully." },
      { q: "What is the character limit?", a: "280 characters per post, counted live in the composer." },
    ],
    related: ["threads", "bluesky", "linkedin"],
  },
  {
    slug: "tiktok",
    key: "tiktok",
    tagline: "Vertical video queued like everything else.",
    answer:
      "MultiPost Studio publishes TikTok videos (vertical 9:16, captions to 2,200 characters) through the API. Video is required — TikTok is a video surface, so photo-only drafts belong on other channels.",
    intro:
      "TikTok rewards volume and timing. Edit once, upload the cut to the composer, write the caption with its hashtags, and slot it into the same weekly queue as the rest of your channels.",
    bestFor: ["Creators posting daily clips", "Brands repurposing Reels and Shorts", "Agencies running client TikToks"],
    accountNote: "Connects via TikTok login with video-upload authorization.",
    faqs: [
      { q: "Can I schedule TikToks in advance?", a: "Yes — upload the video, set caption and hashtags, and queue it like any other post." },
      { q: "What video specs work?", a: "Vertical 9:16 video. The composer validates the upload before it schedules." },
      { q: "Can I post photos to TikTok?", a: "No — TikTok publishing requires video. Repurpose photo content for Instagram or Pinterest instead." },
      { q: "Do captions support hashtags?", a: "Yes, up to 2,200 characters including hashtags." },
    ],
    related: ["instagram", "youtube", "facebook"],
  },
  {
    slug: "youtube",
    key: "youtube",
    tagline: "Uploads and Shorts with chapters-ready descriptions.",
    answer:
      "MultiPost Studio uploads YouTube videos and Shorts (vertical, under 3 minutes, auto-classified by YouTube) with full descriptions up to 5,000 characters. Community posts aren't available — YouTube offers no public API for them.",
    intro:
      "YouTube is the slow compounder: videos keep working for years. Queue uploads and Shorts from the same calendar as your social posts, with descriptions, chapters and links set before anything goes live.",
    bestFor: ["Creators running a Shorts pipeline", "Brands building an evergreen library", "Agencies managing client channels"],
    accountNote: "Connects a YouTube channel via Google login with upload authorization.",
    faqs: [
      { q: "How do Shorts work?", a: "Upload vertical video under 3 minutes — YouTube classifies it as a Short automatically from ratio and length." },
      { q: "What is the file limit?", a: "Up to 128 MB per upload through the API. Compress long 4K edits before queuing." },
      { q: "Can I schedule Community posts?", a: "No — YouTube has no public API for Community posts. Schedule the video and post natively instead." },
      { q: "Do descriptions support chapters and links?", a: "Yes — full 5,000-character descriptions, set in the composer before scheduling." },
    ],
    related: ["tiktok", "instagram", "facebook"],
  },
  {
    slug: "pinterest",
    key: "pinterest",
    tagline: "Photo Pins that keep driving traffic for months.",
    answer:
      "MultiPost Studio publishes Pinterest photo Pins (2:3 or 1:1, descriptions to 500 characters) through the API. Video Pins are not supported — the publisher sends photo Pins only, and says so upfront instead of failing silently.",
    intro:
      "Pinterest is a search engine wearing a social feed. Queue photo Pins with keyword-rich descriptions and they compound for months. Keep captions tight — 500 characters rewards precision.",
    bestFor: ["Bloggers driving evergreen traffic", "E-commerce product discovery", "Creators repurposing carousels as Pins"],
    accountNote: "Connects a Pinterest business account via Pinterest login.",
    faqs: [
      { q: "Can I schedule video Pins?", a: "No — the publisher sends photo Pins only. Video uploads are blocked at validation with a clear message." },
      { q: "What image ratios work?", a: "2:3 or 1:1, one image per Pin." },
      { q: "How long can descriptions be?", a: "500 characters. Front-load the keywords — most viewers never expand." },
      { q: "Do Pins really last longer?", a: "Pinterest surfaces Pins in search for months, unlike feed posts measured in hours. Evergreen recycling pairs well here." },
    ],
    related: ["instagram", "tiktok", "facebook"],
  },
  {
    slug: "threads",
    key: "threads",
    tagline: "Conversational posts in Meta's text network.",
    answer:
      "MultiPost Studio publishes Threads posts (500 characters, optional image or video) through the API, with first-comment support for the discussion prompt.",
    intro:
      "Threads rewards conversation over broadcasting. Cross-post your X threads with the tone adjusted, attach the discussion prompt as a first comment, and keep the cadence steady without another app open.",
    bestFor: ["Creators extending their X presence", "Brands testing conversational formats", "Agencies covering all Meta surfaces"],
    accountNote: "Connects via the Threads API with its own app authorization, separate from Instagram.",
    faqs: [
      { q: "What is the character limit?", a: "500 characters per post, with one optional image or video." },
      { q: "Can I attach a first comment?", a: "Yes — Threads supports first comments, useful for the discussion prompt." },
      { q: "Is Threads the same as an Instagram connection?", a: "No — Threads uses its own app authorization. Connect it separately under Integrations." },
      { q: "Should I cross-post from X?", a: "Yes, but rewrite the opener — the audiences overlap only partially, and identical posts read as lazy to followers on both." },
    ],
    related: ["x", "instagram", "bluesky"],
  },
  {
    slug: "bluesky",
    key: "bluesky",
    tagline: "Short posts via app password — no OAuth maze.",
    answer:
      "MultiPost Studio publishes Bluesky posts (300 characters, up to 4 images) using an app password you generate in Bluesky settings. No OAuth app review, no waiting — paste the password, post on schedule.",
    intro:
      "Bluesky is the lightweight text network: short posts, fast timeline, minimal ceremony. Connect with an app password in under a minute and include it in the same queue as everything else.",
    bestFor: ["Early adopters covering new surfaces", "Developers and tech voices", "Anyone cross-posting short updates"],
    accountNote: "Uses a Bluesky app password (Settings → App Passwords), scoped to posting — never your main password.",
    faqs: [
      { q: "How do I connect Bluesky?", a: "Generate an app password in Bluesky's settings and paste it into the Bluesky connector. It takes about a minute." },
      { q: "What is the character limit?", a: "300 characters per post, with up to 4 images." },
      { q: "Is an app password safe?", a: "Yes — app passwords are scoped credentials you can revoke individually without changing your main password." },
      { q: "Can I schedule threads?", a: "Schedule each post in sequence with a minute between slots — the queue handles the ordering." },
    ],
    related: ["x", "threads", "linkedin"],
  },
  {
    slug: "google-business-profile",
    key: "gbp",
    tagline: "Updates, Events and Offers on Google Search.",
    answer:
      "MultiPost Studio publishes Google Business Profile Updates, Events and Offers (up to 1,500 characters, one image) through the API. This is search-surface content: it shows on your business listing, not in a social feed.",
    intro:
      "Your Google listing is often the first impression — and most businesses let it go stale. Queue Updates, Events and Offers alongside your social calendar so the listing stays alive where customers actually look.",
    bestFor: ["Local businesses and restaurants", "Multi-location brands", "Agencies managing client listings"],
    accountNote: "Connects via Google login, then select which business location each channel represents.",
    faqs: [
      { q: "What post types are supported?", a: "Updates, Events and Offers — each up to 1,500 characters with one optional image." },
      { q: "Where do these posts appear?", a: "On your Google Business listing in Search and Maps — not in a social feed." },
      { q: "Can I manage multiple locations?", a: "Yes — each location connects as its own channel with its own queue." },
      { q: "Do I need a verified listing?", a: "Google requires a verified Business Profile before the API can publish to it." },
    ],
    related: ["facebook", "instagram", "linkedin"],
  },
];

export const PLATFORM_SLUGS = PLATFORM_SEO.map((p) => p.slug);

export function getPlatform(slug: string): PlatformSeo | undefined {
  return PLATFORM_SEO.find((p) => p.slug === slug);
}

export { CONNECT_STEPS };
