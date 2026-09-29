# DPDP Data Flow Map

Engineering compliance document — not legal advice. Reflects actual architecture found in the codebase (September 2026 audit), not aspirational design. Only providers with confirmed live code paths are listed — see `src/lib/adapters/*` for the source of each.

## High-level flow

```
Data Principal (end user / workspace member)
        |
        v
  Signup / Login  ---------------------------->  Google OAuth (login only, plaintext token stored)
        |
        v
  MultiPost Studio app server (Next.js, Vercel or equivalent Node host)
        |
        +--> Postgres (Supabase-hosted or operator-chosen) -- primary store for all tables in DPDP-DATA-INVENTORY.md
        |
        +--> Upstash Redis (optional) -- rate-limit counters only, no personal-data payloads
        |
        +--> S3-compatible object storage (provider set by deployment config: AWS S3 / Supabase Storage / R2 / Spaces / MinIO)
        |         -- uploaded media, processed via `sharp` in-process before storage
        |
        +--> Email delivery: Resend (if configured) or Gmail SMTP (fallback) or console stub (dev)
        |         -- verification links, password resets, notifications; body deliberately never logged
        |
        +--> Billing: Stripe OR Razorpay (mutually exclusive by config; Razorpay wins if both set)
        |         -- customer/subscription IDs, invoice amounts; card data never touches MultiPost's server
        |
        +--> Social platform APIs (Facebook, Instagram, LinkedIn, X, TikTok, Pinterest, YouTube, Threads)
        |         -- OAuth connect/callback, publish, analytics pull, inbox pull
        |         -- MultiPost is Data Processor here; the workspace/customer is Data Fiduciary for this data
        |
        +--> AI provider
        |         -- Legacy mode (ANTHROPIC_API_KEY server-side): prompt + brand context leaves MultiPost's
        |            infrastructure to Anthropic. MultiPost is joint-fiduciary-adjacent here.
        |         -- BYOK mode (AI_BYOK_ENABLED=1, off by default): customer's own decrypted key used
        |            in-process only; MultiPost is Processor only, key never returned to any client.
        |
        +--> Integration OAuth (Google Drive/Photos, Dropbox, OneDrive, Canva, Unsplash)
        |         -- media import; Unsplash is app-level key only, no per-user OAuth
        |
        +--> Admin surfaces (/admin/*, gated by requirePlatformAdmin())
                  -- Users, Orgs, Referrals, Affiliates, Support, Audit Log, Security pages
                  -- CSV export endpoint (/api/admin/export) -- see below
```

## Backup / deletion endpoint (currently incomplete — see gap list)

```
   [Any table above]
        |
        v
   deletedAt flag set (User, Organization only)
        |
        v
   ... nothing further happens ...   <-- GAP: no purge job, no backup-exclusion process,
                                           related rows (Post, MediaAsset, SocialAccount tokens,
                                           SupportTicket, AuditLog) are simply orphaned, not erased
```

There is no confirmed backup-retention process documented in the repo (backups are presumably handled by the Postgres host — Supabase or operator-chosen — outside application code). **Cannot state a backup retention period without asking the infrastructure operator directly.**

## Cross-border transfer signal

No region is pinned in code. `.env.example` uses placeholder region tokens for the Postgres connection string; `DEPLOYMENT.md` lists multiple possible hosts (Neon, Supabase, RDS, Fly, self-hosted) without recommending one. The one concrete signal pointing toward India as a target market: `RAZORPAY_CURRENCY="INR"` default and native `priceMonthlyInr`/`priceAnnualInr` fields on `Plan` — a pricing/market signal, not a data-residency statement.

**Action needed (not code — an operational fact only you have):** confirm where the production Supabase project, Vercel deployment, and Upstash Redis instance are actually provisioned. That answer determines whether DPDP's cross-border transfer provisions (Act §16, Rule 13(4) for SDFs) are even in play. Until that's known, this item stays `LEGAL REVIEW REQUIRED`.

## Third-party processor summary (only confirmed-live integrations)

| Provider | Data category | Purpose | Region stated in repo? |
|---|---|---|---|
| Postgres (Supabase or operator choice) | Everything in the data inventory | Primary datastore | No — placeholder in `.env.example` |
| Upstash Redis | Rate-limit counters only | Abuse prevention | No |
| S3-compatible storage | Uploaded media | Media hosting/CDN | No |
| Resend or Gmail SMTP | Email addresses, transactional email content | Verification, reset, notifications | Not stated (Resend: US-based service; Gmail: Google infra) |
| Stripe / Razorpay | Billing contact info, customer/sub IDs, invoice amounts (no card data) | Payments | Stripe: US-based; Razorpay: India-based |
| Anthropic (legacy AI path only) | Prompt text, brand context | AI generation | Not stated |
| Social platforms (Meta, LinkedIn, X, TikTok, Pinterest, YouTube, Threads) | OAuth tokens, published content, analytics, inbox messages | Core product function | Each platform's own infrastructure, outside MultiPost's control |
| Google/Dropbox/Microsoft/Canva | Integration OAuth tokens | Media import | Each provider's own infrastructure |
| Unsplash | None (app-level API key, no per-user data shared) | Stock image search | N/A |

**Update (29 Sept 2026): Sentry was added after this audit.** `@sentry/nextjs` now runs on server, edge, and client, wired via `src/instrumentation.ts` and `src/instrumentation-client.ts`, sending error/performance events to Sentry (EU ingest region — `ingest.de.sentry.io`). Configured with data minimization on: `dataCollection.userInfo: false`, cookies/HTTP headers/URL query params all denied, GenAI and database-query-data capture off. Session Replay is enabled client-side (`replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`) — Replay records DOM/UI state during a session, which is a genuinely different privacy surface than error text even with PII collection off (it can visually capture whatever was on screen). Add to the processor table above: **Sentry** (error monitoring + session replay) — error text/stack traces, route paths, replay recordings; EU-hosted ingest per the DSN.
