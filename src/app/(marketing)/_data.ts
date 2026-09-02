// Original marketing content for Cadence's public site. No third-party copy.

export const PRODUCT_LINKS = [
  { label: "Overview", href: "/features", desc: "Every stage of social in one workspace" },
  { label: "Publishing", href: "/features/publishing", desc: "Compose, schedule, queue, auto-publish" },
  { label: "Analytics", href: "/features/analytics", desc: "Reports, benchmarks, exports" },
  { label: "Engagement", href: "/features/engagement", desc: "Unified inbox with AI replies" },
  { label: "AI Studio", href: "/features/ai-studio", desc: "On-brand generation and rewriting" },
  { label: "Link Hub", href: "/features/link-hub", desc: "A fast link-in-bio microsite" },
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
  { label: "Customer stories", href: "/customers", desc: "How teams use Cadence" },
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
      "Compose once, tailor per platform, and let the queue handle timing. Cadence retries on failure and tells you the moment something needs a human.",
    points: [
      { title: "Universal composer", body: "Write per-channel variants side by side with live previews and character limits." },
      { title: "Smart queue", body: "Fixed weekly slots per channel, or let AI place posts at your best times." },
      { title: "Reliable auto-publish", body: "Automatic retries, failure alerts, and a clear audit of every attempt." },
      { title: "First comment & UTM", body: "Attach a first comment and build tracked links without leaving the editor." },
    ],
    stat: { value: "10+", label: "platforms supported" },
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
      "Generate hooks, captions, hashtags and platform variants tuned to your Brand Brain — the voice profile Cadence learns from your site, docs and best posts.",
    points: [
      { title: "Brand Brain", body: "Trained on your material so output sounds like you, not a robot." },
      { title: "Repurpose", body: "Turn one post into platform-specific variants, or a blog into a week of content." },
      { title: "Rewrite tools", body: "Shorten, expand, rephrase or shift tone without losing the point." },
      { title: "Pre-publish scoring", body: "Hook strength, CTA, readability and platform fit before you hit schedule." },
    ],
    stat: { value: "8", label: "tone presets + custom" },
  },
  "link-hub": {
    name: "Link Hub",
    tagline: "A link-in-bio that actually converts.",
    intro:
      "A fast, on-brand microsite for the one link you get. Feature posts, products and calls to action, and see what people click.",
    points: [
      { title: "Fast by default", body: "Static-rendered, no bloat, loads instantly on mobile." },
      { title: "On-brand", body: "Uses your workspace colours, logo and fonts automatically." },
      { title: "Click analytics", body: "See which blocks earn taps and iterate weekly." },
      { title: "Post sync", body: "Pull your latest published content in automatically." },
    ],
    stat: { value: "< 1s", label: "typical load time" },
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
      "One person can run a credible social presence with Cadence: AI drafts, automated scheduling, and analytics that surface the next move.",
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
    author: "Maya Osei",
    readMins: 6,
    tag: "Strategy",
    body: [
      "Every few weeks a post takes off and the group chat lights up. It feels like the goal. It isn't.",
      "Virality is high-variance. You can't schedule it, you can't repeat it on demand, and the audience it brings is loosely attached. Consistency is the opposite: low-variance, repeatable, and it compounds.",
      "The teams that grow steadily do a small number of things without skipping. Four to five posts a week. A clear set of content pillars. A queue that runs even when everyone's busy. Cadence exists to make that boring part automatic so the interesting part gets your attention.",
      "Practically: batch-produce, mark your best posts evergreen, and let recycling keep them in rotation with sensible frequency caps. Measure the trend line, not the spikes.",
    ],
  },
  {
    slug: "brand-voice-that-survives-ai",
    title: "A brand voice that survives AI",
    excerpt: "Generative tools flatten everyone to the same middle. Here's how to keep sounding like you.",
    date: "2026-08-04",
    author: "Leo Marchetti",
    readMins: 7,
    tag: "AI",
    body: [
      "The failure mode of AI writing isn't errors — it's sameness. Ask ten brands' assistants for a caption about a product launch and you'll get ten variations of the same competent, forgettable paragraph.",
      "The fix is context. Cadence's Brand Brain is trained on your actual material: site copy, guidelines, and the posts that already performed. Generation is conditioned on that, so it reaches for your examples, your sentence length, your way of closing a post.",
      "Keep feeding it. Add a source every time you write something you're proud of. Over a quarter the difference is obvious.",
    ],
  },
  {
    slug: "approvals-without-the-bottleneck",
    title: "Approvals without the bottleneck",
    excerpt: "Review workflows usually slow teams down. They don't have to.",
    date: "2026-07-21",
    author: "Avery Quinn",
    readMins: 5,
    tag: "Workflow",
    body: [
      "Most approval tools give you one gate: draft, then approved. That's fine until a client is in the loop, or legal, or a manager who's on holiday.",
      "Cadence lets you build the real chain — Creator, Editor, Manager, Client — and tracks every action with a timestamp and a comment. Approved versions are frozen: nobody can silently edit a post after sign-off.",
      "The result is a workflow people trust, which is the only kind that actually gets used.",
    ],
  },
  {
    slug: "what-your-analytics-should-tell-you",
    title: "What your analytics should tell you (that most don't)",
    excerpt: "Charts are table stakes. The value is in the sentence that comes after.",
    date: "2026-07-02",
    author: "Maya Osei",
    readMins: 6,
    tag: "Analytics",
    body: [
      "A follower chart going up is nice. It doesn't tell you what to do on Monday.",
      "Cadence's Insights engine turns the numbers into three lines: what happened, why it happened, and what to do next. 'Your educational carousels earn 42% more saves — shift two slots a week toward them.' That's a decision, not a dashboard.",
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
  },
  {
    slug: "posting-schedule",
    title: "Designing a posting schedule around real data",
    summary: "How to turn your engagement history into a weekly queue that actually fits your audience.",
    minutes: 9,
  },
  {
    slug: "agency-onboarding",
    title: "Onboarding a new client in a day",
    summary: "A checklist for standing up a client workspace: brand kit, channels, approvals and the first month of content.",
    minutes: 15,
  },
  {
    slug: "repurposing",
    title: "Repurposing one idea into a week of posts",
    summary: "Take a single strong idea and adapt it across formats and platforms without it feeling repetitive.",
    minutes: 8,
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
      { type: "new", text: "AI scheduling: 'Optimize my queue' now rebalances the whole week from your engagement history." },
      { type: "new", text: "Report builder: schedule weekly or monthly delivery with white-label branding." },
      { type: "improved", text: "Composer previews now render carousels and first comments." },
      { type: "fixed", text: "Timezone drift on the day view of the calendar." },
    ],
  },
  {
    date: "2026-08-11",
    version: "3.3",
    items: [
      { type: "new", text: "Competitor Intelligence module with AI summaries." },
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
    slug: "northwind-studio",
    name: "Northwind Studio",
    industry: "Agency",
    quote: "We moved eleven client accounts onto Cadence in a week. The approval trail alone paid for it.",
    person: "Avery Quinn, Founder",
    result: "3.1× faster client sign-off",
  },
  {
    slug: "alpine-coffee",
    name: "Alpine Coffee Roasters",
    industry: "Food & beverage",
    quote: "The health score told us our cadence had slipped below four a week. We fixed it and reach followed.",
    person: "Dana Reyes, Marketing",
    result: "+38% reach in one quarter",
  },
  {
    slug: "fitwave",
    name: "Fitwave",
    industry: "Health & wellness",
    quote: "Repurposing turned our newsletter into a week of posts. One person now runs the whole channel.",
    person: "Sam Okafor, Growth",
    result: "1 person, 4 platforms",
  },
];
