// Original marketing content for MultiPost Studio's public site. No third-party copy.

export const PRODUCT_LINKS = [
  { label: "Overview", href: "/features", desc: "Every stage of social in one workspace" },
  { label: "Publishing", href: "/features/publishing", desc: "Compose, schedule, queue, auto-publish" },
  { label: "Analytics", href: "/features/analytics", desc: "Reports, benchmarks, exports" },
  { label: "Engagement", href: "/features/engagement", desc: "Unified inbox with AI replies" },
  { label: "AI Studio", href: "/features/ai-studio", desc: "On-brand generation and rewriting" },
  { label: "Recycling", href: "/features/recycling", desc: "Evergreen content rotation" },
];

export const SOLUTION_LINKS = [
  { label: "Creators", href: "/solutions/creators", desc: "Grow an audience without burning out" },
  { label: "Small business", href: "/solutions/small-business", desc: "Consistent presence, less effort" },
  { label: "Agencies", href: "/solutions/agencies", desc: "Run many clients from one place" },
  { label: "Marketing teams", href: "/solutions/marketing-teams", desc: "Plan, approve and measure together" },
  { label: "Startups", href: "/solutions/startups", desc: "Punch above your headcount" },
  { label: "Enterprise", href: "/solutions/enterprise", desc: "Governance, SSO and scale" },
];

export const RESOURCE_LINKS = [
  { label: "Blog", href: "/blog", desc: "Playbooks and product notes" },
  { label: "Guides", href: "/guides", desc: "Deep dives on doing social well" },
  { label: "Free tools", href: "/tools", desc: "Generators and calculators" },
  { label: "Customer stories", href: "/customers", desc: "How teams use MultiPost Studio" },
  { label: "Templates", href: "/resources/templates", desc: "Starting points for every format" },
  { label: "Help center", href: "/help", desc: "Answers and how-tos" },
];

export const COMPANY_LINKS = [
  { label: "About", href: "/about" },
  { label: "Careers", href: "/careers" },
  { label: "Contact", href: "/contact" },
  { label: "Press", href: "/press" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Changelog", href: "/changelog" },
];

export const LEGAL_LINKS = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "DPA", href: "/legal/dpa" },
  { label: "Cookies", href: "/legal/cookies" },
  { label: "Security", href: "/security" },
  { label: "Status", href: "/status" },
];

/* ---------- feature sub-pages ---------- */
export const FEATURE_PAGES: Record<
  string,
  {
    name: string;
    tagline: string;
    intro: string;
    points: { title: string; body: string }[];
    stat: { value: string; label: string };
  }
> = {
  publishing: {
    name: "Publishing",
    tagline: "Get posts out the door — reliably.",
    intro:
      "Compose once, tailor per platform, and let the queue handle timing. MultiPost Studio retries on failure and tells you the moment something needs a human.",
    points: [
      { title: "Universal composer", body: "Write per-channel variants side by side with live previews and character limits." },
      { title: "Smart queue", body: "Fixed weekly slots per channel — set them from your own engagement data." },
      { title: "Reliable auto-publish", body: "Automatic retries, failure alerts, and a clear audit of every attempt." },
      { title: "First comment & UTM", body: "Attach a first comment and build tracked links without leaving the editor." },
    ],
    stat: { value: "9", label: "platforms to publish to" },
  },
  analytics: {
    name: "Analytics",
    tagline: "Numbers that tell you what to do.",
    intro:
      "Cross-channel dashboards, post-level breakdowns, and a report builder that exports clean PDFs and CSVs — or a shareable link.",
    points: [
      { title: "Cross-channel rollups", body: "Followers, reach, engagement and rate with period-over-period deltas." },
      { title: "Content breakdowns", body: "See which formats and pillars actually move numbers." },
      { title: "Report builder", body: "Drag widgets, add branding, schedule weekly or monthly delivery." },
      { title: "Health score", body: "One number for consistency, growth, engagement and response speed." },
    ],
    stat: { value: "90 days", label: "of history, always" },
  },
  engagement: {
    name: "Engagement",
    tagline: "One inbox for every conversation.",
    intro:
      "Comments, mentions, DMs and reviews land in a single stream with sentiment, priority and assignment — plus AI replies that match your voice.",
    points: [
      { title: "Unified inbox", body: "Every network, one queue. Filter by platform, status or assignee." },
      { title: "AI replies", body: "Draft, shorten, professionalise or match brand voice in one click." },
      { title: "Saved replies & notes", body: "Reusable answers and internal notes that never get sent by accident." },
      { title: "Sentiment & priority", body: "Negative conversations rise to the top automatically." },
    ],
    stat: { value: "4 modes", label: "of AI reply per message" },
  },
  "ai-studio": {
    name: "AI Studio",
    tagline: "On-brand content, on demand.",
    intro:
      "Generate hooks, captions, hashtags and platform variants tuned to your Brand Brain — the voice profile MultiPost Studio learns from your site, docs and best posts.",
    points: [
      { title: "Brand Brain", body: "Trained on your material so output sounds like you, not a robot." },
      { title: "Repurpose", body: "Turn one post into platform-specific variants, or a blog into a week of content." },
      { title: "Rewrite tools", body: "Shorten, expand, rephrase or shift tone without losing the point." },
      { title: "Pre-publish scoring", body: "Hook strength, CTA, readability and platform fit before you hit schedule." },
    ],
    stat: { value: "8", label: "tone presets, incl. Brand voice" },
  },
  recycling: {
    name: "Evergreen Recycling",
    tagline: "Keep your best content circulating.",
    intro:
      "Automatically re-queue and rotate high-performing evergreen posts across your channels with frequency caps, minimum gap spacing, and performance safeguards.",
    points: [
      { title: "Automated queue refill", body: "Never let your channels go silent. Evergreen posts smoothly fill queue gaps." },
      { title: "Frequency caps", body: "Set maximum republish counts and mandatory rest intervals between shares." },
      { title: "Performance-filtered", body: "Promote only posts that achieved high engagement into the evergreen rotation." },
      { title: "Per-channel rules", body: "Tailor recycling frequency independently for X, LinkedIn, Facebook, and Instagram." },
    ],
    stat: { value: "Auto-pilot", label: "republishing control" },
  },
};

/* ---------- solutions ---------- */
export const SOLUTION_PAGES: Record<
  string,
  { name: string; tagline: string; intro: string; bullets: string[]; cta: string }
> = {
  creators: {
    name: "Creators",
    tagline: "Show up consistently without the grind.",
    intro:
      "Batch a month of content in an afternoon, let the queue drip it out, and spend your energy on the work that only you can do.",
    bullets: [
      "Ideas board to capture thoughts the moment they land",
      "AI Studio for hooks and captions in your voice",
      "Best-time scheduling from your own engagement data",
      "Evergreen recycling so your best posts keep working",
    ],
    cta: "Start free — no card",
  },
  "small-business": {
    name: "Small business",
    tagline: "A steady presence, a fraction of the time.",
    intro:
      "Plan a week in one sitting, reply to customers from one inbox, and get a plain-English read on what's working.",
    bullets: [
      "Templates for promos, launches and behind-the-scenes",
      "Unified inbox for comments, DMs and reviews",
      "Health score that tells you exactly what to fix",
      "Reports you can actually understand",
    ],
    cta: "Try the demo",
  },
  agencies: {
    name: "Agencies",
    tagline: "Every client, one workspace.",
    intro:
      "Separate workspaces per client, multi-stage approvals with a locked audit trail, white-label reports, and a rollup that shows the whole book of business at a glance.",
    bullets: [
      "Client workspaces with isolated brand, channels and team",
      "Approval chains: Creator → Editor → Manager → Client",
      "White-label PDF reports and shareable links",
      "Agency overview: scheduled content, approvals, alerts per client",
    ],
    cta: "Book a walkthrough",
  },
  "marketing-teams": {
    name: "Marketing teams",
    tagline: "Plan, approve and measure — together.",
    intro:
      "Roles and permissions, threaded comments, campaign tracking and a calendar the whole team trusts.",
    bullets: [
      "Org and workspace roles with a real permission matrix",
      "Campaigns that tie posts, goals and results together",
      "Approvals that never overwrite an approved version",
      "Activity history for every change",
    ],
    cta: "Start a team trial",
  },
  startups: {
    name: "Startups",
    tagline: "Punch above your headcount.",
    intro:
      "One person can run a credible social presence with MultiPost Studio: AI drafts, automated scheduling, and analytics that surface the next move.",
    bullets: [
      "AI Studio + Brand Brain to move fast without sounding generic",
      "Automation engine for the repetitive parts",
      "Opportunity score to prioritise what to make",
      "Free plan to start, upgrade when you connect more",
    ],
    cta: "Start free",
  },
  enterprise: {
    name: "Enterprise",
    tagline: "Scale with governance built in.",
    intro:
      "SSO and SCIM, audit exports, granular permissions, and dedicated support — with the same workspace your team already likes.",
    bullets: [
      "SSO / SCIM provisioning and de-provisioning",
      "Immutable audit log across security and billing events",
      "Custom seat, channel and AI-credit allocations",
      "Dedicated onboarding and a named contact",
    ],
    cta: "Contact sales",
  },
};

/* ---------- blog ---------- */
export const BLOG_POSTS = [
  {
    slug: "consistency-beats-virality",
    title: "Consistency beats virality (and the data backs it up)",
    excerpt: "One viral post is a lottery ticket. A steady cadence is a compounding asset. Here's how to build one.",
    date: "2026-08-18",
    author: "MultiPost Studio Team",
    readMins: 6,
    tag: "Strategy",
    body: [
      "Every few weeks a post takes off and the group chat lights up. It feels like the goal. It isn't.",
      "Virality is high-variance. You can't schedule it, you can't repeat it on demand, and the audience it brings is loosely attached. Consistency is the opposite: low-variance, repeatable, and it compounds.",
      "The teams that grow steadily do a small number of things without skipping. Four to five posts a week. A clear set of content pillars. A queue that runs even when everyone's busy. MultiPost Studio exists to make that boring part automatic so the interesting part gets your attention.",
      "Practically: batch-produce, mark your best posts evergreen, and let recycling keep them in rotation with sensible frequency caps. Measure the trend line, not the spikes.",
    ],
  },
  {
    slug: "brand-voice-that-survives-ai",
    title: "A brand voice that survives AI",
    excerpt: "Generative tools flatten everyone to the same middle. Here's how to keep sounding like you.",
    date: "2026-08-04",
    author: "MultiPost Studio Team",
    readMins: 7,
    tag: "AI",
    body: [
      "The failure mode of AI writing isn't errors — it's sameness. Ask ten brands' assistants for a caption about a product launch and you'll get ten variations of the same competent, forgettable paragraph.",
      "The fix is context. MultiPost Studio's Brand Brain is trained on your actual material: site copy, guidelines, and the posts that already performed. Generation is conditioned on that, so it reaches for your examples, your sentence length, your way of closing a post.",
      "Keep feeding it. Add a source every time you write something you're proud of. Over a quarter the difference is obvious.",
    ],
  },
  {
    slug: "approvals-without-the-bottleneck",
    title: "Approvals without the bottleneck",
    excerpt: "Review workflows usually slow teams down. They don't have to.",
    date: "2026-07-21",
    author: "MultiPost Studio Team",
    readMins: 5,
    tag: "Workflow",
    body: [
      "Most approval tools give you one gate: draft, then approved. That's fine until a client is in the loop, or legal, or a manager who's on holiday.",
      "MultiPost Studio lets you build the real chain — Creator, Editor, Manager, Client — and tracks every action with a timestamp and a comment. Approved versions are frozen: nobody can silently edit a post after sign-off.",
      "The result is a workflow people trust, which is the only kind that actually gets used.",
    ],
  },
  {
    slug: "what-your-analytics-should-tell-you",
    title: "What your analytics should tell you (that most don't)",
    excerpt: "Charts are table stakes. The value is in the sentence that comes after.",
    date: "2026-07-02",
    author: "MultiPost Studio Team",
    readMins: 6,
    tag: "Analytics",
    body: [
      "A follower chart going up is nice. It doesn't tell you what to do on Monday.",
      "MultiPost Studio's Insights engine turns the numbers into three lines: what happened, why it happened, and what to do next. 'Your educational carousels earn 42% more saves — shift two slots a week toward them.' That's a decision, not a dashboard.",
      "We'd rather show you five of those than fifty charts.",
    ],
  },
];

/* ---------- guides ---------- */
export const GUIDES = [
  {
    slug: "content-pillars",
    title: "Building content pillars that don't get stale",
    summary: "A repeatable framework for deciding what to post, so you're never staring at a blank composer.",
    minutes: 12,
    whyItMatters:
      "A blank composer is the biggest tax on consistency. Teams that post reliably aren't more creative — they've already decided, ahead of time, what categories of content they make. That decision is the pillar.",
    framework: [
      "Pick 3–5 pillars, not 10. Each one should be something you can say something new about every week.",
      "Write one sentence per pillar describing the reader's takeaway — not the topic, the payoff.",
      "Hold the set for a full quarter before changing it. Rotating pillars too often is the same problem as having none.",
      "Score each draft against its pillar before you schedule it. If it doesn't fit one, it's a one-off — post it, but don't let it become a new pillar by accident.",
    ],
    inMultiPostStudio:
      "Set your pillars on a workspace's content plan and tag ideas on the Ideas board against them. Content Pillar reporting shows how your actual output splits across pillars over the last 30 days, so a pillar going quiet is visible before it disappears from the calendar entirely.",
  },
  {
    slug: "posting-schedule",
    title: "Designing a posting schedule around real data",
    summary: "How to turn your engagement history into a weekly queue that actually fits your audience.",
    minutes: 9,
    whyItMatters:
      "A schedule copied from a blog post about \"best times to post\" is a guess about someone else's audience. Your own engagement history is a fact about yours.",
    framework: [
      "Pull the last 90 days of engagement by hour and weekday, per channel — not pooled across channels, since audiences differ by platform.",
      "Start with the top 2–3 windows per channel, not one. A single slot is fragile; a short list survives a platform's algorithm changing week to week.",
      "Fix the slots for a month before adjusting. Constant retiming makes it impossible to tell if a change in results came from timing or from the content itself.",
      "Revisit quarterly, not weekly. Audience behavior shifts slowly; chasing noise wastes effort.",
    ],
    inMultiPostStudio:
      "Each channel gets its own queue slots (weekday + hour), so a schedule can differ per platform without juggling separate calendars. Analytics shows engagement by hour/weekday per channel to inform where to put those slots, and the queue handles publishing — with retries — once they're set.",
  },
  {
    slug: "agency-onboarding",
    title: "Onboarding a new client in a day",
    summary: "A checklist for standing up a client workspace: brand kit, channels, approvals and the first month of content.",
    minutes: 15,
    whyItMatters:
      "The slow part of client onboarding usually isn't the work — it's context-switching between five disconnected tools to set up channels, permissions and the first batch of content. Doing it in one workspace collapses that into one session.",
    framework: [
      "Create the workspace and capture brand basics first — voice, tone and anything the client already has written down.",
      "Connect channels next, while the client is available to approve OAuth screens, so you're not blocked waiting on them later.",
      "Set the approval chain to match who actually needs to sign off — often just the client, sometimes an internal reviewer first.",
      "Batch the first two weeks of content before handoff, so the client sees a working calendar on day one instead of an empty one.",
    ],
    inMultiPostStudio:
      "A client gets their own workspace with a scoped client role — they can review and approve, not edit workspace settings or billing. Approval chains support the internal-reviewer-then-client pattern out of the box, and a shareable portal link gives the client a read-only view of the calendar and reports without a full login.",
  },
  {
    slug: "repurposing",
    title: "Repurposing one idea into a week of posts",
    summary: "Take a single strong idea and adapt it across formats and platforms without it feeling repetitive.",
    minutes: 8,
    whyItMatters:
      "Most teams treat repurposing as copy-pasting the same text everywhere, which reads as lazy to anyone following more than one of your channels. Real repurposing changes the format and length to fit each platform's native voice — the idea repeats, the execution doesn't.",
    framework: [
      "Start from the idea's core claim, not the first draft's wording — the claim is what survives the rewrite.",
      "Lead with the platform's native format first: a thread's first line, a carousel's cover slide, a caption's hook.",
      "Cut, don't just reformat. A LinkedIn post trimmed to a caption should lose detail, not just line breaks.",
      "Space repurposed variants across the week instead of posting them all the same day, so they read as a series, not a duplicate.",
    ],
    inMultiPostStudio:
      "The repurpose tool takes one source post and adapts it per target platform — respecting each platform's character limit and native conventions (a shortened lead sentence for X/Threads/Bluesky, a discussion prompt for LinkedIn, hashtags for Instagram) — so the week's variants start from one idea without starting from one identical draft.",
  },
];

/* ---------- careers ---------- */
export const JOBS = [
  { slug: "senior-product-engineer", title: "Senior Product Engineer", team: "Engineering", location: "Remote (global)", type: "Full-time" },
  { slug: "design-engineer", title: "Design Engineer", team: "Design", location: "Remote (Americas / EU)", type: "Full-time" },
  { slug: "ml-engineer-generation", title: "ML Engineer, Generation", team: "AI", location: "Remote (global)", type: "Full-time" },
  { slug: "customer-success-lead", title: "Customer Success Lead", team: "Success", location: "Remote (EU)", type: "Full-time" },
  { slug: "content-marketer", title: "Content Marketer", team: "Marketing", location: "Remote (global)", type: "Contract" },
];

/* ---------- changelog ---------- */
export const CHANGELOG = [
  {
    date: "2026-08-28",
    version: "3.4",
    items: [
      { type: "new", text: "Report builder: schedule weekly or monthly delivery with white-label branding." },
      { type: "improved", text: "Composer previews now render carousels and first comments." },
      { type: "fixed", text: "Timezone drift on the day view of the calendar." },
    ],
  },
  {
    date: "2026-08-11",
    version: "3.3",
    items: [
      { type: "new", text: "Competitor Intelligence module for benchmarking against public accounts." },
      { type: "new", text: "Content Opportunity Score on the Opportunities page." },
      { type: "improved", text: "Approval chains now support an unlimited number of stages." },
    ],
  },
  {
    date: "2026-07-24",
    version: "3.2",
    items: [
      { type: "new", text: "Evergreen recycling with frequency caps and minimum-gap rules." },
      { type: "improved", text: "Brand Brain now ingests uploaded documents, not just URLs." },
      { type: "fixed", text: "Rare duplicate publish when a job was retried during a deploy." },
    ],
  },
];

/* ---------- roadmap ---------- */
export const ROADMAP = {
  now: [
    "Native threads and carousels in the composer for every supported platform",
    "Bulk CSV import for content calendars",
    "Slack app for approvals and publish alerts",
  ],
  next: [
    "Team-level content goals with automated progress nudges",
    "A/B testing of hooks with automatic winner selection",
    "Deeper audience demographics via authorized platform connectors",
  ],
  later: [
    "Mobile apps for iOS and Android",
    "Public API v2 with granular scopes and per-endpoint rate limits",
    "Marketplace for community templates and automations",
  ],
};

/* ---------- customers ---------- */
export const CUSTOMERS = [
  {
    slug: "agency-workflow",
    name: "Multi-Client Agency Operations",
    industry: "Marketing Agency",
    quote: "Managing 10+ client workspaces with locked approval trails and client review portals eliminates accidental publishes.",
    person: "Agency Operations Playbook",
    result: "Zero sign-off bottlenecks",
  },
  {
    slug: "content-creator",
    name: "Solo Creators & Media Brands",
    industry: "Creators & Media",
    quote: "Batching a week of multi-network content and letting the queue drip it out saved over 15 hours a week.",
    person: "Creator Strategy Playbook",
    result: "9 networks from 1 draft",
  },
  {
    slug: "growth-teams",
    name: "Fast-Paced Marketing Teams",
    industry: "SaaS & Growth",
    quote: "Keeping our brand tone intact across Instagram, LinkedIn and X with centralized triage keeps response times under an hour.",
    person: "Marketing Team Playbook",
    result: "Unified cross-platform presence",
  },
];
