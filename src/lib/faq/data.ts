/**
 * The site's FAQ answers. Every answer here describes something the product does today
 * (checked against the code and the existing pages), and none repeats a price or a plan
 * limit: those come from the live plan rows (see plans.ts) so they can't drift when an
 * admin edits /admin/plans. Page FAQs are only the *seed*: an admin can override any page's
 * set from Admin → Content → faq (`{ "page": "<key>", "q", "a" }`).
 */

export type FaqItem = { q: string; a: string };
export type FaqGroup = { id: string; title: string; blurb: string; items: FaqItem[] };

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blurb: "What it is, and how to be up and running in minutes.",
    items: [
      { q: "What is MultiPost Studio?", a: "A social media workspace. You plan on a calendar, write once and tune a version per network with live previews and limits, schedule and publish through the networks' official APIs, answer comments and messages from one inbox, and report on what worked. Teams add approvals and client review on top." },
      { q: "How do I get started?", a: "Sign up, open Integrations and connect a channel (you approve access on the network's own login screen), then write your first post in the composer and schedule it or add it to a queue. A short getting-started checklist in the app walks you through the same steps." },
      { q: "Do I need to install anything?", a: "No. It runs in the browser and the web app is fully responsive. On a phone or desktop you can also install it from the browser as an app. Native iOS and Android apps are on the roadmap." },
      { q: "Can I try something without signing up?", a: "Yes. The free tools (caption and hashtag generators, character counter, best-time and engagement-rate calculators) work with no account." },
      { q: "Can I bring my existing content calendar?", a: "Posts can be imported in bulk from a CSV on the calendar (an import guide lists the columns), and they land on their dates ready to review. Your connected accounts are linked fresh, because every network requires you to authorize them yourself." },
    ],
  },
  {
    id: "publishing",
    title: "Publishing & networks",
    blurb: "Which networks, which formats, and what happens when something goes wrong.",
    items: [
      { q: "Which social networks does it support?", a: "Instagram, Facebook, LinkedIn, X, TikTok, YouTube, Pinterest, Threads, Google Business Profile and Bluesky. Each network has its own page listing exactly which formats publish today and which don't." },
      { q: "Does it really publish for me, or just remind me?", a: "It publishes through the networks' official APIs wherever they allow it. Where a network doesn't open a format to third-party tools, the composer says so before you schedule, instead of accepting the post and dropping part of it later." },
      { q: "What happens if a scheduled post fails?", a: "Temporary failures are retried automatically, up to five attempts. If it still can't go out, the post is flagged in the queue with the reason, your team is notified, and you can retry it in one click. Channels that already published are not sent twice." },
      { q: "How does it know a post fits each network?", a: "The composer checks each channel live: length, hashtags, mentions, media type, count, aspect ratio and video length. Anything that would block publishing is listed with the fix, and you can adapt one draft per network." },
      { q: "What is the queue?", a: "A weekly set of posting slots per channel. Add a post to the queue and it takes the next free slot, so you keep a steady cadence without picking a time every time. Slots can be set from your own engagement data." },
      { q: "How does best-time-to-post work?", a: "It is measured from your own published posts and their results, not a generic guess. You need enough published posts with metrics before it shows a suggestion." },
      { q: "Can I reuse my best posts?", a: "Yes. Mark a post as evergreen and recycling re-queues top performers on a schedule you control, with frequency caps so your feed doesn't repeat itself." },
      { q: "Where do my images and videos come from?", a: "Upload once to the Media Library and pick from it in any post. You can also import from Google Drive, Google Photos, Dropbox and OneDrive, and bring in designs from Canva." },
    ],
  },
  {
    id: "ai",
    title: "AI features",
    blurb: "What the AI does, what it sends where, and using your own key.",
    items: [
      { q: "What can the AI do?", a: "Content Studio drafts hooks, captions, hashtags and per-network variants, can repurpose long-form into social posts, suggests ideas and scores a draft before you publish. Brand Brain gives it your voice so drafts sound like you. Which tools you get depends on your plan." },
      { q: "Can I use my own AI key?", a: "Yes. In Settings → AI Providers you can connect your own OpenAI, Google Gemini or Anthropic key. It is stored encrypted, used on the server only, and never shown back to you or sent to the browser." },
      { q: "Is my content used to train AI models?", a: "No. We don't train models on your content. Brand Brain is per-workspace context used only to shape your own generations. Your text goes to the AI provider only to produce the result you asked for, and with your own key that is your account with that provider." },
      { q: "What if the AI provider is down or my key stops working?", a: "You are told plainly. If a model can't answer, the app can fall back to a simple template and labels it as one, rather than presenting it as AI output. If a key is rejected, the AI Providers page shows why and lets you test it." },
      { q: "What is an AI credit?", a: "Roughly one generation: a set of captions, a repurpose or a rewrite. Each plan includes a monthly allowance that resets every month." },
    ],
  },
  {
    id: "teams",
    title: "Teams, approvals & agencies",
    blurb: "Working with colleagues and clients.",
    items: [
      { q: "Can my team work together?", a: "Yes. Invite teammates by email and give each a role (such as manager, editor, creator, analyst or viewer). Roles decide who can create, approve or only view, and internal notes and comments keep the discussion next to the post. How many seats you get depends on your plan." },
      { q: "How do approvals work?", a: "Posts that need a decision appear in Approvals. Reviewers approve, or request changes with a note, and approved posts carry on to their scheduled time. Approval workflows are part of the Team plan and above." },
      { q: "Can a client review posts without a full login?", a: "Yes. A shareable client link gives a read-only view for review, and clients can also be added as members of just their own workspace so they only ever see their own approvals and reports." },
      { q: "Do agencies get separate client workspaces?", a: "Every client can have an isolated workspace with its own brand, channels, team, approvals and reports, and an agency overview rolls them up. White-label reports and client accounts are on the Agency plan." },
      { q: "Can I build reports for clients?", a: "Yes. The report builder lets you pick the widgets and date range, then share a report or schedule it for delivery. Exports are available as PDF and CSV depending on your plan." },
    ],
  },
  {
    id: "engagement",
    title: "Inbox & analytics",
    blurb: "Replying, measuring and exporting.",
    items: [
      { q: "What does the inbox cover?", a: "Comments and messages from your connected channels, wherever the network gives us API access, in one stream with assignment, saved replies and AI-drafted replies you can edit. What reaches the inbox can differ by network; each network page spells it out." },
      { q: "What can I measure?", a: "Reach, engagement and follower growth per channel and per post, your best posting times, and how each format performs. Advanced and audience analytics, competitor analytics and the report builder are on higher plans." },
      { q: "How far back does analytics history go?", a: "It depends on your plan: longer plans keep longer history, and the date ranges you can pick are limited to what your plan retains." },
      { q: "Can I export my data?", a: "Analytics export as CSV on every plan and as PDF reports on paid plans. For your account data (what we hold about you), use Settings → Privacy & Data to request an export." },
    ],
  },
  {
    id: "security",
    title: "Security & privacy",
    blurb: "How accounts, tokens and personal data are handled.",
    items: [
      { q: "Do you see or store my social passwords?", a: "No. You approve access on each network's own login screen and we receive an access token, never your password. Tokens are stored encrypted and scoped to your workspace." },
      { q: "How do I secure my own account?", a: "Turn on two-factor sign-in with an authenticator app in Settings → Security, and review the devices signed in to your account, revoking any you don't recognise. You can sign in with email and password or with Google." },
      { q: "Do you support single sign-on (SSO) or SCIM?", a: "Sign-in today is email and password or Google, with optional two-factor. SSO and SCIM provisioning are Enterprise-plan requirements that we scope with you directly, so please ask us about your identity provider before relying on it." },
      { q: "Is one workspace's data visible to another?", a: "No. Data is queried per workspace, and each client workspace is isolated from the others." },
      { q: "How do I get a copy of my data or have it deleted?", a: "Settings → Privacy & Data lets you request a copy, a correction or deletion. Each request is tracked until it is resolved. You can also raise a complaint from the same page." },
      { q: "Do you have a data processing agreement?", a: "Yes. Our Data Processing Addendum, privacy policy and India DPDP notice are published on the site, and you can ask us for a signed copy." },
      { q: "I found a security problem. Who do I tell?", a: "Email multipoststudio@gmail.com directly and we'll respond promptly. The security page has the details." },
    ],
  },
  {
    id: "integrations",
    title: "API, automation & partners",
    blurb: "Connecting other tools.",
    items: [
      { q: "Is there an API and webhooks?", a: "Yes, on the Team plan and above. Create scoped API keys in Settings → API Keys, and send events (post published, post failed, post scheduled, approval requested or approved, new conversation, new insight) to a URL you control from the Webhook Center." },
      { q: "Can I connect Zapier or Make?", a: "You can connect them through API keys and webhooks, which is how other tools reach MultiPost Studio. There is no separate Zapier app listing to install." },
      { q: "Do you have an affiliate program?", a: "Yes. You can join from inside the app, and the public affiliate terms are on the site. Joining is a separate, explicit opt-in." },
      { q: "Can I automate repetitive work?", a: "Automations run rules for you, such as auto-replies and tagging: pick a trigger and an action and switch it on. The number of automations depends on your plan." },
    ],
  },
  {
    id: "support",
    title: "Account & support",
    blurb: "Getting help and managing your account.",
    items: [
      { q: "How do I contact support?", a: "From inside the app, open Settings → Support to send a ticket, or use the feedback button in the top bar, which captures the page you were on. You can also reach us from the contact page." },
      { q: "I forgot my password.", a: "Use “Forgot password” on the sign-in page and follow the link we email you. If you signed up with Google, sign in with Google instead." },
      { q: "How do I delete my account?", a: "Request deletion under Settings → Privacy & Data. It is reviewed and followed up rather than done instantly, so nothing is lost by accident." },
      { q: "How do I leave a review or give feedback?", a: "Open the account menu and choose “Review MultiPost Studio”, or use the feedback button for product suggestions. The roadmap shows what is planned and what has shipped." },
      { q: "Do you offer phone support?", a: "Not by default. In-app requests and email are faster to resolve and leave a written trail. Enterprise plans can add a scheduled call line." },
    ],
  },
];

/** Every group's questions, flat. */
export const ALL_FAQS: FaqItem[] = FAQ_GROUPS.flatMap((g) => g.items);

const pick = (...qs: string[]): FaqItem[] =>
  qs.map((q) => {
    const hit = ALL_FAQS.find((f) => f.q === q);
    if (!hit) throw new Error(`FAQ not found: ${q}`);
    return hit;
  });

/**
 * Seeds for pages that don't have a bespoke set. Keys match the `page` field an admin uses in
 * Admin → Content → faq, so any of these can be replaced without a deploy.
 */
export const PAGE_FAQS: Record<string, FaqItem[]> = {
  landing: [
    ...pick("What is MultiPost Studio?", "Which social networks does it support?", "Does it really publish for me, or just remind me?", "Can I use my own AI key?"),
    { q: "Is there a free plan?", a: "Yes. The free plan needs no card and lets you connect a few channels, use the composer and calendar, and try the AI tools. Paid plans raise the limits and add team, analytics and automation features. The pricing page always shows the current numbers." },
    ...pick("Can my team work together?", "Do you see or store my social passwords?"),
  ],
  features: [
    ...pick("How does it know a post fits each network?", "What is the queue?", "What can the AI do?", "How do approvals work?", "What does the inbox cover?", "Can I export my data?"),
  ],
  platforms: [
    ...pick("Which social networks does it support?", "Does it really publish for me, or just remind me?", "What happens if a scheduled post fails?"),
    { q: "Why can't I post every format to every network?", a: "Each network decides which formats its API allows third-party tools to publish. We show the real list per network and never pretend a format works when it doesn't." },
    { q: "Do all networks come with every plan?", a: "No. Some networks are included on the free plan and others start on paid plans. The pricing page lists which networks each plan includes." },
  ],
  comparisons: [
    { q: "Are these comparisons fair?", a: "We use sourced facts, fair framing and say who should pick which tool. Where a competitor is the better fit for a particular need, the page says so." },
    { q: "How current is the competitor information?", a: "Competitors change prices and features often. Treat each page as a starting point and confirm the details on the competitor's own site before you decide." },
    { q: "Why does pricing differ so much between tools?", a: "Tools charge per seat, per channel or per workspace. We compare on your real setup (how many channels and people you have), which is what decides what you actually pay." },
    ...pick("Can I bring my existing content calendar?"),
  ],
  customers: [
    { q: "Are these real customer stories?", a: "They are illustrative playbooks, labelled as such, showing how different kinds of teams can work in one workspace. Real customer feedback lives on the reviews page and only ever includes reviews customers chose to publish." },
    ...pick("Do agencies get separate client workspaces?", "Can a client review posts without a full login?", "Can my team work together?"),
  ],
  security: [
    ...pick("Do you see or store my social passwords?", "How do I secure my own account?", "Do you support single sign-on (SSO) or SCIM?", "Is one workspace's data visible to another?", "How do I get a copy of my data or have it deleted?", "Do you have a data processing agreement?", "Is my content used to train AI models?", "I found a security problem. Who do I tell?"),
  ],
  about: [
    { q: "Who builds MultiPost Studio?", a: "A small, remote team. It started as an internal tool for an agency that was drowning in tabs, and it turned out everyone had the same problem." },
    { q: "Where can I see what you're working on?", a: "The roadmap shows what is planned and what has landed, and the changelog lists everything we ship in order. Both are public." },
    { q: "How do I give feedback or request a feature?", a: "Use the feedback button in the app, or the contact page. The roadmap shows what has come from customer requests." },
    { q: "Are you hiring?", a: "Open roles are listed on the careers page, which is kept current." },
  ],
  guides: [
    { q: "Are the guides free?", a: "Yes. They are free to read with no account, and the frameworks work with any tool, though they are sharpest with MultiPost Studio." },
    { q: "Where should I start?", a: "Start with the learn hub: fix a weekly schedule first, then add content pillars so you always know what to post, then choose tools." },
    { q: "Can I suggest a topic?", a: "Yes, send it through the contact page. Requests that come up repeatedly become guides." },
  ],
  templates: [
    { q: "Are the templates free?", a: "Yes. Copy one into your workspace and make it yours; they are starting structures, not rules." },
    { q: "Do templates work on every network?", a: "They are written as structures you adapt per network. The composer then checks each channel's limits and shows a preview before you schedule." },
    { q: "Can I save my own templates?", a: "Yes. Templates in your workspace are yours to create, edit and reuse across channels." },
  ],
  status: [
    { q: "What does this page measure?", a: "Live health of each subsystem from real probes and error telemetry, with a history strip, an uptime figure for the window shown and an incident history." },
    { q: "What should I do if something looks wrong for me but the page says operational?", a: "Send a ticket from Settings → Support or use the feedback button in the app; it captures the page you were on, which helps us find the cause." },
    { q: "What happens to scheduled posts during an incident?", a: "Temporary failures are retried automatically, up to five attempts, and any post that still can't go out is flagged in the queue with the reason and a one-click retry." },
  ],
  changelog: [
    { q: "How do I know when something new ships?", a: "Everything is listed here in the order it ships, newest first, with each item marked as new, improved or fixed." },
    { q: "Where can I see what's coming?", a: "The roadmap lists what is planned. Dates are deliberately not promised." },
    { q: "How do I request a change?", a: "Use the in-app feedback button or the contact page. Much of what ships begins as a customer request." },
  ],
  careers: [
    { q: "Are roles remote?", a: "We're a small, remote team and each role lists its location and type on its page." },
    { q: "How do I apply?", a: "Open the role you're interested in from the list on this page and follow the apply instructions there." },
    { q: "How does the team work?", a: "Async-first, with decisions and context written down. We ship to learn, own outcomes rather than task lists, and care about the parts users feel." },
  ],
  webinars: [
    { q: "Are these live webinars on a calendar?", a: "No. They are private, screen-shared walkthroughs you book for your own team, about 30 minutes with roughly 20 minutes of demo and 10 of live Q&A." },
    { q: "Is it a slide deck?", a: "No. We work inside a real MultiPost Studio workspace so you see the product, not slides." },
    { q: "How do I book one?", a: "Use the contact page and choose “Sales”, or ask for the track that matches where you're stuck: content at scale, approvals, analytics or agency onboarding." },
  ],
  press: [
    { q: "How do I get logos and screenshots?", a: "Request the logo pack (SVG and PNG) and product screenshots from the contact page and choose “Press”." },
    { q: "How quickly do you reply to media enquiries?", a: "We aim to reply to asset requests within 48 hours." },
    { q: "How should the name be written?", a: "Always “MultiPost Studio”, with both words capitalised. The brand basics on this page cover the logo, spacing and what not to do." },
  ],
  reviews: [
    { q: "Who can leave a review?", a: "Signed-in customers, from the account menu inside the app. That's why every review comes from a real account." },
    { q: "How are reviews moderated?", a: "We remove spam and abuse only. Genuine reviews stay up, whatever the rating, and a review is only shown with its author's consent to publish." },
    { q: "Can I edit or remove my review?", a: "Yes, any time, from the same account menu entry. Removing it deletes it." },
  ],
  help: [
    ...pick("What happens if a scheduled post fails?", "How does it know a post fits each network?", "Can a client review posts without a full login?", "Is my content used to train AI models?", "Can I export my data?", "How do I contact support?"),
  ],
  contact: [
    { q: "Do you offer phone support?", a: "Not by default. In-app requests and email are faster to resolve and leave a written trail. Enterprise plans can add a scheduled call line." },
    { q: "Can I get a demo before signing up?", a: "Yes. Use the form and choose “Sales” for a walkthrough, or start the free plan and try it yourself. It needs no card." },
    { q: "Where are you based?", a: "We're fully distributed across time zones, which is how support stays fast around the clock." },
    { q: "I found a security issue.", a: "Email multipoststudio@gmail.com directly. The security page explains how we handle disclosures." },
  ],
  community: [
    { q: "Is there a public forum or Discord?", a: "Not yet. Feedback and questions go through the contact page, which reaches the team directly instead of sitting in a queue." },
    { q: "Do I need a paid plan to give feedback?", a: "No. Anyone with a MultiPost Studio account, including the free plan, can reach out." },
    { q: "How do I request a feature?", a: "Contact us and pick “Feedback”, or use the feedback button in the app. The roadmap shows what is already planned or shipped from requests like yours." },
  ],
  roadmap: [
    { q: "Can I request a feature?", a: "Yes. Use the contact form or the in-app feedback button. We tag requests, and a lot of what ships starts there." },
    { q: "How often does this change?", a: "Most weeks. Items move between columns as scope firms up or priorities shift." },
    { q: "Is a dated item a promise?", a: "No. We avoid hard dates on purpose. Items in Now are the safest bet a few weeks out." },
    { q: "Where's the mobile app?", a: "Native iOS and Android apps are planned and sit in Later. Meanwhile the web app is fully responsive and can be installed to your phone or desktop from the browser." },
  ],
  solutions: [
    { q: "Can I change plans as my team grows?", a: "Yes. Upgrade or downgrade any time from Settings → Billing: the new plan starts today and the old one stops renewing at the end of the period you've paid for. Channels, workspaces and seats each have their own allowance in your plan." },
    ...pick("Do agencies get separate client workspaces?", "Can my team work together?", "Do you support single sign-on (SSO) or SCIM?"),
    { q: "What happens to my data if I cancel?", a: "Cancelling stops future charges. Before you go you can export your analytics from the app, and Settings → Privacy & Data lets you request a copy of your data or its deletion." },
  ],
  learn: [
    { q: "Where do I start with social media management?", a: "Fix a weekly schedule first: three to five slots per channel from your engagement data. Then add content pillars so you always know what to post. Tools come third." },
    { q: "How often should a small team post?", a: "Four to five posts a week across your main channels beats daily posting for a month and then silence. Consistency compounds; bursts don't." },
    { q: "Do I need paid tools to start?", a: "No. The frameworks here work with a free plan or native scheduling. Paid tools buy back time (queues, approvals, analytics) once volume grows." },
    { q: "How do I prove social media is working?", a: "Track reach, engagement rate and follower growth per channel month over month, and tie standout posts to business outcomes in a one-page monthly report." },
  ],
  tools: [
    { q: "Do I need an account?", a: "No. Every tool on this page works with no sign-up." },
    { q: "Is my input saved anywhere?", a: "No. The calculators run entirely in your browser. The generators send your input to our servers only to produce the result; it is never written to a database or tied to an account." },
    { q: "Can I use them commercially?", a: "Yes, freely. Attribution is appreciated but not required." },
    { q: "Will more tools be added?", a: "Yes. We add one whenever a request comes up often enough. Suggest one through the contact page." },
  ],
  blog: [
    { q: "How often do you publish?", a: "New posts are added regularly. Browse by category, or read the guides for longer playbooks." },
    { q: "Can I suggest a topic?", a: "Yes, through the contact page. Requests that come up repeatedly become posts." },
  ],
};
