# MultiPost Studio — launch blog batch (60 posts)

Audience: social media managers, creators, small-business owners, agencies, in-house marketing teams (global, English; many readers in India, the US, the UK).

## Hard rules for every post

1. **Markdown only.** No HTML. **Do not write an H1** — the title is rendered separately. Use `##` and `###` only.
2. **Length:** 1,000–1,400 words (never under 900).
3. **Answer first (AEO):** the first paragraph is a direct, self-contained 40–60 word answer to the question in the title. A reader (or an AI answer engine) should be able to quote just that paragraph.
4. Then `## Key takeaways` — 3–5 bullets, each a complete, quotable statement.
5. Body: 4–6 `##` sections, `###` where useful. Use short numbered steps for processes and bullets for lists. Define terms in one clear sentence the first time (GEO: entity-rich, citable, unambiguous). Name platforms and tools explicitly; avoid vague "social networks".
6. `## Frequently asked questions` — exactly 4 questions as `### Question text?` each followed by a 1–3 sentence direct answer (this becomes FAQ structured data, so keep each answer self-contained).
7. Last section `## How MultiPost Studio helps` — 2–4 sentences, truthful, specific to the post's topic, with ONE internal link from the allowed list below. No hype, no superlatives.
8. **SEO:** focus keyword appears in the first 100 words, in the seoTitle, in at least one `##` heading, and naturally 4–8 times overall. Secondary keywords appear naturally. No keyword stuffing. seoTitle ≤ 60 characters. seoDescription 140–155 characters, includes the focus keyword, reads like a benefit. slug: lowercase-hyphenated, ≤ 60 chars.
9. **Honesty (critical):**
   - **No invented statistics, studies, surveys, percentages, quotes, case studies, customer names, or dates.** If you want a number, it must come from the VERIFIED FACTS below or be an obviously illustrative example labelled as such ("for example, if you post 3 times a week…").
   - Never claim a MultiPost Studio feature that is not in the list below. In particular MultiPost Studio does **not** have a referral program for end users, a mobile app, or auto-DM tools. When unsure, read the repo (`src/app/(marketing)/features`, `src/lib/constants.ts`, `src/lib/social/capabilities.ts`) before claiming.
   - Platform rules change; for any platform limit write "as of 2026" or "at the time of writing".
   - Don't promise results ("will double your reach"). Use "can help", "tends to".
10. Tone: clear, practical, plain English, second person, no filler intros ("In today's fast-paced world…"), no emoji in headings.
11. Frontmatter (YAML between `---` lines), exactly these keys, then the Markdown body:

```
---
title: The post title (Title Case, under 70 chars)
slug: the-url-slug
excerpt: One benefit-led sentence, 120–160 characters.
seoTitle: Focus keyword first, ≤ 60 chars
seoDescription: 140–155 characters.
focusKeyword: the focus keyword
secondaryKeywords: kw one, kw two, kw three, kw four
category: Platform Guides
tags: tag one, tag two, tag three
readMins: 6
---
```

`category` must be one of: Platform Guides, Scheduling & Workflow, Strategy, Analytics, AI & Automation, Agencies & Teams.
File name: `src/content/blog-launch/NN-slug.md` where NN is the post number below (01–60), zero-padded.

## Allowed internal links (use exactly one per post, in "How MultiPost Studio helps")

Verify each exists under `src/app/(marketing)` before using it; if one doesn't exist, use `/pricing` or `/features`.
`/features`, `/pricing`, `/platforms`, `/tools/hashtag-generator`, `/tools/character-counter`.

## MultiPost Studio — what it really does (safe to mention)

Publishes to Instagram, Facebook, LinkedIn, X, TikTok, YouTube, Pinterest, Threads, Bluesky and Google Business Profile. Composer with per-channel text and live platform previews. **Platform-aware validation:** each channel shows its own limit and what needs fixing before you publish (character counts measured the way each platform measures them, hashtag limits, media rules). Content calendar, scheduling, an auto-queue with weekly time slots, "best time" suggestions, evergreen recycling, bulk import, hashtag groups, content templates, an AI caption writer / rewriter / hashtag suggestions / alt-text suggestions, brand voice settings, first-comment auto-post (Instagram, Facebook, LinkedIn, Threads, X), UTM tagging on links, campaigns and content pillars, approval workflows with roles, team workspaces and agency mode with client portals, a unified inbox (comments/messages), analytics dashboards, scheduled and exportable reports, white-label reports, competitor tracking, audit log. Free plan available; see /pricing for paid plans (don't quote prices).

## VERIFIED FACTS you may state (as of October 2026)

- Instagram: Help Center states up to **5 hashtags** per post; caption max **2,200 characters**; up to 20 @-mentions in a caption through the API. (Instagram's developer docs still list 30 hashtags for the API; the 5-tag limit is the in-app rule — say so if you discuss it.)
- Threads: **500 characters** per post (emoji count as their UTF-8 byte length in the API); **one topic tag** per post; max 5 unique links per post via the API; carousel 2–20 items.
- X: **280 characters** for standard accounts, counted by weight (every URL counts as 23; most emoji and CJK characters count as 2). Longer posts (up to **25,000 characters**) are available to paid subscribers.
- Bluesky: **300 graphemes** (user-perceived characters, so one emoji = 1) per post; up to 4 images.
- TikTok: video caption up to **2,200 UTF-16 characters**; hashtags and mentions are part of the caption; apps not yet audited by TikTok publish privately.
- YouTube: title **100 characters**; description **5,000 bytes** in the API; more than **60 hashtags** makes YouTube ignore all hashtags on the video; hashtags (#) are different from hidden "tags". Shorts can be up to 3 minutes.
- LinkedIn: a post can be up to **3,000 characters**; there is no official hashtag limit (3–5 relevant ones is common advice, not a rule).
- Pinterest: pin title **100 characters**, description **800 characters**, alt text 500.
- Facebook: no official hashtag limit; (long post text is allowed; don't state a number).
- Google Business Profile: posts (updates, events, offers) are supported; don't state a character number.

---

## Posts

### Cluster 1 — Platform Guides (category: Platform Guides)

01. Instagram Hashtag Limit: How Many Hashtags You Can Use in 2026 — kw: instagram hashtag limit — secondary: how many hashtags on instagram, instagram hashtags 2026, instagram hashtag strategy
02. X (Twitter) Character Limit: 280 vs 25,000 Explained — kw: x character limit — secondary: twitter character limit, x premium long posts, how x counts characters
03. Bluesky Character Limit and Graphemes Explained — kw: bluesky character limit — secondary: bluesky 300 characters, graphemes explained, bluesky post length
04. TikTok Caption Length and Hashtag Rules — kw: tiktok caption length — secondary: tiktok caption character limit, tiktok hashtags, tiktok description
05. YouTube Title and Description Limits (Characters, Bytes, Hashtags) — kw: youtube description character limit — secondary: youtube title length, youtube hashtags limit, youtube tags vs hashtags
06. LinkedIn Hashtags: How Many Should You Use? — kw: how many hashtags on linkedin — secondary: linkedin hashtags, linkedin post length, linkedin hashtag strategy
07. Threads Topic Tags: How They Work and How to Use Them — kw: threads topic tags — secondary: threads hashtags, threads post limit, threads topic tag
08. Pinterest Pin Title and Description Length — kw: pinterest description length — secondary: pinterest title length, pinterest seo, pinterest pin best practices
09. Social Media Character Limits by Platform: 2026 Cheat Sheet — kw: social media character limits — secondary: character limits by platform, post length limits, caption length
10. Facebook Post Best Practices: Length, Hashtags and Timing — kw: facebook post length — secondary: facebook hashtags, facebook posting tips, facebook page posts

### Cluster 2 — Scheduling & Workflow (category: Scheduling & Workflow)

11. Best Time to Post on Social Media: How to Find Yours — kw: best time to post on social media — secondary: best time to post on instagram, when to post on linkedin, posting time analytics
12. How to Build a Social Media Content Calendar (Step by Step) — kw: social media content calendar — secondary: content calendar template, plan social media posts, monthly content calendar
13. Social Media Scheduling Tools: What to Look For — kw: social media scheduling tool — secondary: social media scheduler, post scheduling software, compare scheduling tools
14. How to Schedule Instagram Posts From Your Computer — kw: schedule instagram posts — secondary: instagram scheduler, schedule reels, instagram content planner
15. Batch Content Creation: A Weekly Workflow That Saves Hours — kw: batch content creation — secondary: batching social media, content batching workflow, weekly content plan
16. How to Schedule LinkedIn Posts (and When) — kw: schedule linkedin posts — secondary: linkedin scheduler, linkedin posting schedule, linkedin company page posts
17. Social Media Queue: How an Auto-Queue Keeps You Consistent — kw: social media queue — secondary: posting queue, auto schedule posts, queue time slots
18. Cross-Posting vs Repurposing: Why Copy-Paste Fails — kw: cross posting social media — secondary: repurpose content for social, cross-post instagram to facebook, platform native content
19. How Often Should You Post on Social Media? — kw: how often to post on social media — secondary: posting frequency, how often to post on instagram, consistency vs volume
20. Social Media Approval Workflows for Teams — kw: social media approval workflow — secondary: content approval process, approve social posts, review and approval

### Cluster 3 — Strategy (category: Strategy)

21. Social Media Strategy Template for Small Teams — kw: social media strategy — secondary: social media strategy template, social media plan, strategy framework
22. Content Pillars: How to Define Yours and Plan Around Them — kw: content pillars — secondary: social media content pillars, content themes, content pillar examples
23. Social Media Goals and KPIs That Actually Matter — kw: social media kpis — secondary: social media goals, smart goals social media, metrics to track
24. Social Media Audit Checklist: Review Every Channel in an Afternoon — kw: social media audit — secondary: social media audit checklist, audit your accounts, profile audit
25. How to Repurpose One Blog Post Into 10 Social Posts — kw: repurpose blog post — secondary: repurpose content, content repurposing workflow, blog to social media
26. Social Media for Small Business: A Simple Starting Plan — kw: social media for small business — secondary: small business marketing, local business social media, starter plan
27. How to Grow on Instagram Without Ads — kw: grow instagram organically — secondary: grow instagram followers, instagram growth tips, instagram engagement
28. Evergreen Content: Examples and How to Recycle It — kw: evergreen content — secondary: evergreen social media posts, recycle content, evergreen content examples
29. Social Media Hooks That Stop the Scroll (With Templates) — kw: social media hooks — secondary: hook examples, first line of caption, scroll stopping content
30. User-Generated Content: How to Ask, Credit and Reuse It — kw: user generated content — secondary: ugc social media, customer content, ugc permissions

### Cluster 4 — Analytics (category: Analytics)

31. Engagement Rate Formula: How to Calculate It Correctly — kw: engagement rate formula — secondary: social media engagement rate, engagement by reach, engagement by followers
32. UTM Parameters for Social Media: A Practical Guide — kw: utm parameters — secondary: utm tracking, utm_source utm_medium utm_campaign, campaign tagging
33. How to Track Social Media ROI Without Guesswork — kw: social media roi — secondary: measure social media roi, attribution social media, conversion tracking
34. Social Media Analytics: The Metrics Worth Your Attention — kw: social media analytics — secondary: social media metrics, analytics dashboard, vanity metrics
35. How to Read Instagram Insights (and What to Do With Them) — kw: instagram insights — secondary: instagram analytics, instagram reach, instagram saves
36. A/B Testing Social Media Posts: A Simple Method — kw: social media a/b testing — secondary: test social posts, split testing captions, experiment design
37. Social Media Competitor Analysis: A Repeatable Process — kw: social media competitor analysis — secondary: competitor tracking, benchmark competitors, competitive analysis
38. Social Media Reports Clients Actually Read — kw: social media report — secondary: social media reporting, client reports, monthly report template
39. Reach vs Impressions: What's the Difference? — kw: reach vs impressions — secondary: impressions meaning, reach meaning, social media metrics explained
40. Link in Bio: How to Track What Happens After the Click — kw: link in bio — secondary: link in bio tracking, instagram link in bio, utm link in bio

### Cluster 5 — AI & Automation (category: AI & Automation)

41. AI Caption Generator: How to Use One Without Sounding Robotic — kw: ai caption generator — secondary: ai social media captions, ai caption writer, edit ai captions
42. AI for Social Media: Workflows That Actually Save Time — kw: ai for social media — secondary: ai social media tools, ai content workflow, ai social strategy
43. Brand Voice Guidelines for Social Media (With a Template) — kw: brand voice — secondary: brand voice guidelines, tone of voice social media, voice and tone
44. Social Media Automation: What to Automate and What Not To — kw: social media automation — secondary: automate social media, automation rules, what not to automate
45. Prompt Templates for Social Media Captions — kw: social media caption prompts — secondary: ai prompts for social media, caption prompt template, prompt engineering captions
46. Generative Engine Optimization (GEO): Getting Cited by AI Answers — kw: generative engine optimization — secondary: geo seo, ai search visibility, get cited by ai
47. Answer Engine Optimization (AEO): Write Content AI Can Quote — kw: answer engine optimization — secondary: aeo content, featured snippets, faq schema
48. Hashtag Research: How to Choose Hashtags That Fit Each Platform — kw: hashtag research — secondary: find hashtags, hashtag strategy, hashtag groups
49. Social Listening for Small Teams: A Practical Start — kw: social listening — secondary: brand monitoring, listen to your audience, social listening tools
50. Alt Text and Captions: Making Social Posts Accessible — kw: alt text for social media — secondary: accessible social media, image descriptions, video captions

### Cluster 6 — Agencies & Teams (category: Agencies & Teams)

51. Social Media Management for Agencies: A Scalable Workflow — kw: social media agency workflow — secondary: agency social media management, manage client accounts, agency processes
52. Client Approvals for Social Media: Process and Templates — kw: client approval social media — secondary: approval process clients, content approvals, client portal
53. White-Label Social Media Reports: What to Include — kw: white label social media reports — secondary: white label reporting, branded reports, agency reporting
54. How to Manage Multiple Social Media Accounts Without Burning Out — kw: manage multiple social media accounts — secondary: multiple accounts workflow, social media management, account organization
55. Social Media Team Roles and Permissions: Who Should Do What — kw: social media team roles — secondary: permissions social media team, roles and responsibilities, content team structure
56. Onboarding a New Social Media Client: A Checklist — kw: client onboarding social media — secondary: agency onboarding checklist, client intake, onboarding questionnaire
57. How to Price Social Media Management Services — kw: how to price social media management — secondary: social media pricing models, retainer pricing, agency pricing
58. Social Media Crisis Management: A Plan Before You Need One — kw: social media crisis management — secondary: crisis communication plan, handle negative comments, response protocol
59. Google Business Profile Posts: What to Post and How Often — kw: google business profile posts — secondary: google business posts, local seo posts, gbp updates events offers
60. Social Media Compliance and Disclosures: A Plain-English Checklist — kw: social media compliance — secondary: influencer disclosure, advertising disclosure, brand compliance checklist
