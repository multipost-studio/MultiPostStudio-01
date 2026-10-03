# MultiPost Studio — Topical Authority Map

> SEO content roadmap. Search volume is **not verified** (no keyword tooling
> connected) — priorities below reflect commercial intent, product fit, and
> ranking realism for a new domain, not measured volume.
> Last reviewed: October 2026. Refresh quarterly against Search Console.

Conventions: Intent ∈ {Informational, Commercial, Transactional, Navigational}.
Status ∈ {live, planned, research}.

## Pillar 1 — Product (commercial core)

| Keyword | Intent | Target URL | Type | Priority | Status |
|---|---|---|---|---|---|
| social media management software | Commercial | /features | Feature index | P0 | live |
| social media scheduling software | Commercial | /features/publishing | Feature page | P0 | live |
| social media management platform pricing | Transactional | /pricing | Pricing | P0 | live |
| MultiPost Studio | Navigational | / | Homepage | P0 | live |
| MultiPost Studio pricing | Transactional | /pricing | Pricing | P1 | live |
| MultiPost Studio login | Navigational | /login | Auth (noindex) | P1 | live |
| MultiPost Studio review | Commercial | /comparisons | Comparisons index | P1 | live |
| MultiPost Studio alternatives | Commercial | /comparisons | Comparisons index | P1 | live |

## Pillar 2 — Platforms (programmatic-but-unique, data-driven)

Parent: /platforms. Children derive capability tables from
`src/lib/social/capabilities.ts` — content stays accurate automatically.

| Keyword | Intent | Target URL | Type | Priority | Status |
|---|---|---|---|---|---|
| Instagram scheduling tool | Commercial | /platforms/instagram | Platform page | P0 | live |
| LinkedIn scheduling software | Commercial | /platforms/linkedin | Platform page | P0 | live |
| schedule TikTok posts | Commercial | /platforms/tiktok | Platform page | P1 | live |
| YouTube scheduler / schedule Shorts | Commercial | /platforms/youtube | Platform page | P1 | live |
| Facebook Page scheduler | Commercial | /platforms/facebook | Platform page | P1 | live |
| schedule X posts / Twitter scheduler | Commercial | /platforms/x | Platform page | P1 | live |
| Pinterest scheduler | Commercial | /platforms/pinterest | Platform page | P2 | live |
| Threads scheduling app | Commercial | /platforms/threads | Platform page | P2 | live |
| Bluesky scheduler | Commercial | /platforms/bluesky | Platform page | P2 | live |
| Google Business Profile post scheduler | Commercial | /platforms/google-business-profile | Platform page | P2 | live |

## Pillar 3 — Learn (informational hub)

Parent: /learn. Supporting: /guides/*, /blog/*, /tools/*.

| Keyword | Intent | Target URL | Type | Priority | Status |
|---|---|---|---|---|---|
| how to schedule social media posts | Informational | /learn | Hub | P0 | live |
| social media content calendar | Informational | /guides/content-pillars | Guide | P0 | live |
| how to create a social media content calendar | Informational | /guides/content-pillars | Guide | P1 | live |
| best time to post on social media | Informational | /tools/best-time | Free tool | P1 | live |
| how to approve social media posts | Informational | /blog/approvals-without-the-bottleneck | Article | P1 | live |
| how to measure social media performance | Informational | /blog/what-your-analytics-should-tell-you | Article | P1 | live |
| social media reporting for agencies | Informational | /guides/agency-onboarding | Guide | P2 | live |
| how to repurpose content across platforms | Informational | /guides/repurposing | Guide | P1 | live |

## Pillar 4 — Comparisons (commercial investigation)

Parent: /comparisons. Rule: only sourced, last-verified pages ship.

| Keyword | Intent | Target URL | Type | Priority | Status |
|---|---|---|---|---|---|
| Buffer alternative | Commercial | /comparisons/buffer | Comparison | P0 | live |
| Hootsuite alternative | Commercial | /comparisons/hootsuite | Comparison | P0 | live |
| Hootsuite vs Buffer (capture overflow) | Commercial | /comparisons | Index | P2 | live |
| Sprout Social alternative | Commercial | /comparisons | Index (no page until researched) | P3 | research |
| Later alternative | Commercial | /comparisons | Index (no page until researched) | P3 | research |

## Pillar 5 — Audiences (solutions)

| Keyword | Intent | Target URL | Type | Priority | Status |
|---|---|---|---|---|---|
| social media tools for agencies | Commercial | /solutions/agencies | Solution | P0 | live |
| social media scheduler for creators | Commercial | /solutions/creators | Solution | P1 | live |
| social media management for small business | Commercial | /solutions/small-business | Solution | P1 | live |
| social media approval workflow for clients | Commercial | /solutions/marketing-teams | Solution | P1 | live |
| social media management for SaaS / startups | Commercial | /solutions/startups | Solution | P2 | live |
| enterprise social media management | Commercial | /solutions/enterprise | Solution | P2 | live |

## Internal-linking rules

- Every platform page links: parent /platforms, 3 related platforms,
  /features/publishing, /pricing.
- Every comparison links: sibling comparison, /pricing, /features.
- /learn links every cluster article; every article links back to /learn
  (articles link upward via related blocks — add as articles refresh).
- No "click here" anchors. No more than ~6 in-content links per page.

## Cannibalization watch

- /learn (hub) vs /guides (index): hub frames + curates, guides hold depth.
  If a learn sub-page is ever added, pick ONE target per keyword above.
- /platforms/instagram vs /blog/*: platform page = capability reference;
  blog = narrative/strategy. Different intent, no conflict.
- /comparisons vs /pricing: comparisons investigate, pricing transacts.

## Refresh cadence

- Comparisons: re-verify vendor facts quarterly; bump LAST_VERIFIED.
- Platform pages: capability tables auto-update from code; review copy on
  capability changes (LinkedIn media, X media).
- Pricing-adjacent claims: regenerate from PLAN_CATALOG on plan changes.
