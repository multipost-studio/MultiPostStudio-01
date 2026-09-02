# Deploying MultiPost Studio

MultiPost Studio ships **dual-mode**: every external integration has a real
implementation that activates when its env vars are present, and a stub
fallback otherwise. You can deploy with zero integration keys and add them one
at a time.

---

## 1. Provision

| Need | Options |
|------|---------|
| Postgres 16+ | Neon, Supabase, RDS, Fly Postgres, self-hosted |
| Node host | Vercel, Fly, Render, Railway, a container platform, bare VM |
| (optional) Redis | Upstash (REST) — for cross-instance rate limiting |
| (optional) Object storage | S3, Cloudflare R2, DigitalOcean Spaces, MinIO |
| (optional) Stripe account | billing |
| (optional) Anthropic API key | real AI generation |
| (optional) Resend account | transactional email |

## 2. Configure

Copy `.env.example` → `.env` (or set the vars in your platform). Required:

```
DATABASE_URL=postgresql://…
AUTH_SECRET=$(openssl rand -base64 32)
APP_URL=https://your-domain
```

`src/lib/env.ts` validates everything at boot and **throws in production** if a
required var is missing or malformed. Optional blocks are validated only when
present.

## 3. Database (Postgres)

The schema targets Postgres and uses `directUrl` for migrations. There are **no
committed migrations** — generate the baseline once:

```
# .env: DATABASE_URL and DIRECT_URL both point at the *direct* (port 5432)
# Supabase string for this one-time step.
npx prisma migrate dev --name init
git add prisma/migrations && git commit -m "chore: postgres baseline migration"
```

After that, every deploy runs `prisma migrate deploy` automatically
(`npm run vercel-build`) — it uses `DIRECT_URL`. Seed demo data on the first
deploy only if you want it: `npm run db:seed`.

Local dev also uses Postgres now — point local `DATABASE_URL`/`DIRECT_URL` at a
Supabase project (or `docker compose up db`).

---

## Vercel quickstart (Vercel + Supabase)

1. **Supabase** → create a project. *Project Settings → Database*:
   - **Direct connection** (port 5432, host `db.<ref>.supabase.co`) → this is
     `DIRECT_URL`.
   - **Connection pooling** → *Transaction* mode string (port 6543, host
     `aws-0-<region>.pooler.supabase.com`, user `postgres.<ref>`) → this is
     `DATABASE_URL`. Append `?pgbouncer=true&connection_limit=1`.
   - Percent-encode any special characters in the DB password.
2. **Baseline migration** (once, locally): put the **direct** string in both
   `DATABASE_URL` and `DIRECT_URL` in `.env`, run
   `npx prisma migrate dev --name init`, commit `prisma/migrations/`.
3. **Push** the repo to GitHub.
4. **Vercel** → *Add New → Project* → import the repo. Root directory:
   `cadence`. It auto-detects Next.js; `vercel.json` sets the build command.
5. **Env vars** (Project → Settings → Environment Variables), Production +
   Preview:
   | var | value |
   |-----|-------|
   | `DATABASE_URL` | Supabase **pooled** string (6543, `?pgbouncer=true&connection_limit=1`) |
   | `DIRECT_URL` | Supabase **direct** string (5432) |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `APP_URL` | `https://<project>.vercel.app` (set after first deploy, then redeploy) |
   | `CRON_SECRET` | `openssl rand -hex 24` |
   | `TOKEN_ENC_KEY` | `openssl rand -base64 32` |
   | `NEXT_PUBLIC_SHOW_DEMO` | leave unset (hides demo hints) |
   | *(optional)* `ANTHROPIC_API_KEY`, `RESEND_API_KEY` + `EMAIL_FROM`, `S3_*`, `OAUTH_*` | as you enable each |
6. **Deploy.** `vercel-build` runs `prisma migrate deploy` then `next build`.
7. **Set `APP_URL`** to the real deployment URL and redeploy (needed for auth
   callbacks + email links).
8. **Cron:** `vercel.json` has a daily backstop (Hobby caps Vercel Cron at
   1×/day). For real cadence, `.github/workflows/tick.yml` posts to
   `/api/cron/tick` every ~5 min — add repo secrets `DEPLOY_URL` (no trailing
   slash) and `CRON_SECRET`. For 1-minute precision, use an external scheduler
   (cron-job.org) hitting `POST {APP_URL}/api/cron/tick` with header
   `Authorization: Bearer <CRON_SECRET>`. On **Pro**: set the `vercel.json`
   schedule to `* * * * *` and skip the workflow.
9. **First account:** `npm run db:seed` (creates `demo@multipoststudio.app`) then
   change that password, **or** just sign up at `/signup` and delete the demo
   user later.
10. **OAuth redirect URLs:** in each provider's app, add
    `https://<project>.vercel.app/api/oauth/<platform>/callback`.

The standalone `Dockerfile` / `docker-compose.yml` remain for a self-hosted
path and are not used by Vercel.

## 4. Build & run

```
npm ci
npm run build        # prisma generate + next build (standalone output)
npm start            # or: node .next/standalone/server.js
```

Run the **publish worker** as a separate process (handles scheduled publishing
and automations):

```
npm run worker
```

In production also set `CRON_SECRET` — this makes `/api/cron/tick` reject the
unauthenticated in-app poller (it disables itself on 401) so publishing is
driven only by the worker or an authenticated platform cron:

```
curl -X POST https://your-domain/api/cron/tick \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Docker

`docker compose up --build` brings up Postgres + a one-shot migration job +
web + worker. `Dockerfile` is a multi-stage build producing the Next.js
standalone server.

## 5. Integrations

### Billing — Razorpay (default)
Configure **one** provider; Razorpay takes precedence if both are set.

1. Razorpay Dashboard → **Settings → API Keys** → generate live/test keys →
   set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
2. **Settings → Webhooks** → add `{APP_URL}/api/webhooks/razorpay`, secret →
   `RAZORPAY_WEBHOOK_SECRET`. Enable events: `subscription.activated`,
   `subscription.charged`, `subscription.resumed`, `subscription.cancelled`,
   `subscription.completed`, `subscription.halted`.
3. Set the **post-payment redirect** (dashboard) to
   `{APP_URL}/settings/billing?changed=1`.
4. `RAZORPAY_CURRENCY` defaults to `INR`. **Set real prices** — the
   `PLAN_CATALOG` values in `src/lib/constants.ts` are minor units (paise) and
   currently hold USD-cent defaults; e.g. change `pro.priceMonthly` to `149900`
   for ₹1499/mo.
5. Flow: `startCheckout` creates a Razorpay plan + subscription and redirects
   to the hosted `short_url`. The `subscription.activated` / `.charged` webhook
   is what updates the local subscription + invoices. Cancels call the Razorpay
   cancel API (`cancel_at_cycle_end`).
6. Without a provider configured, plan changes use the internal confirm page.

### Billing — Stripe (alternative)
- Set `STRIPE_SECRET_KEY`.
- Register a webhook endpoint: `{APP_URL}/api/webhooks/stripe`, events
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`. Put its signing secret in
  `STRIPE_WEBHOOK_SECRET`.
- Without the webhook secret the endpoint returns 501 and plan changes fall
  back to the internal confirm page.
- Prices are created ad-hoc from `PLAN_CATALOG` (`src/lib/constants.ts`) — no
  Price IDs to manage.

### Anthropic
- Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`). All AI actions
  fall back to deterministic templates on error or when unset.
- AI actions are rate-limited to 20/min/user.

### Email (Resend)
- Set `RESEND_API_KEY` and `EMAIL_FROM`. Until then, verification / reset
  tokens are surfaced directly in the UI for local testing.

### Object storage
- Set `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
  (and `S3_PUBLIC_URL` for a CDN). Otherwise uploads are stored under
  `public/uploads`.

### Rate limiting
- In-memory by default (per instance). Set `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN` for shared limits across instances.

### Social accounts (OAuth + publishing)
Dual-mode, per platform:

| Platform | Auth | Publishing | Needs |
|----------|------|-----------|-------|
| Bluesky | App password (in-app) | ✅ real, works now | nothing |
| LinkedIn | OAuth2 | ✅ real (text posts) | LinkedIn app + `OAUTH_LINKEDIN_CLIENT_ID/SECRET` |
| Facebook Page | OAuth2 | ✅ real (text posts) | Meta app + `OAUTH_META_CLIENT_ID/SECRET`, app review |
| X / Twitter | OAuth2 + PKCE | ✅ real (text tweets) | X app (read+write) + `OAUTH_X_CLIENT_ID/SECRET` |
| Instagram | OAuth2 | ⛔ not wired (needs media pipeline) | Meta app |
| TikTok / YouTube / Pinterest / Threads / GBP | OAuth2 config present | ⛔ publish not wired | provider apps |

Setup per OAuth platform:
1. Create a developer app on the platform.
2. Add the redirect URI **exactly**: `{OAUTH_REDIRECT_BASE or APP_URL}/api/oauth/<platform>/callback`
3. Request the posting scopes (listed in `src/lib/social/providers.ts`) and pass
   the platform's review where required.
4. Put the client id/secret in env. The platform's connect button in
   `/integrations` switches from the manual-entry stub to real OAuth
   automatically.
5. Set `TOKEN_ENC_KEY` (`openssl rand -base64 32`) so stored tokens are
   encrypted with a stable key.

Any platform without credentials keeps the manual handle-entry stub (creates a
placeholder connection, no real publishing). Scheduled posts publish for real
on connected real accounts and stay simulated for stub connections — mixed
posts publish per-channel.

### Public REST API
- Keys are created in `/settings/api` (`cad_live_…`, shown once, sha256-stored).
- Auth: `Authorization: Bearer cad_live_…`. Scoped, rate-limited 120 req/min/key.
- Endpoints: `GET /api/v1/me`, `GET /api/v1/channels`, `GET|POST /api/v1/posts`,
  `GET /api/v1/posts/:id`, `GET /api/v1/analytics`.

## 6. Health & observability

- `GET /api/health` — returns 200 `{ ok: true }` when the DB is reachable, 503
  otherwise. Wire it to your platform's health check (the Docker image already
  has a `HEALTHCHECK`).
- Logs are structured JSON via `pino` in production (`LOG_LEVEL`, default
  `info`). Pretty-printed in dev.

## 7. Known issues

- `npm audit` reports transitive advisories in `@prisma/config`'s dependency
  tree (`deepmerge-ts`, `effect`). `npm audit fix --force` would downgrade
  `prisma` to 6.12 (broken with this schema). Prisma is pinned at 6.16.2
  deliberately; revisit when a patched `@prisma/config` ships.

## Pre-launch checklist

- [ ] `DATABASE_URL` points at Postgres; `provider` switched; `migrate deploy` run
- [ ] `AUTH_SECRET` is a fresh 32-byte random value
- [ ] `APP_URL` is the real public origin
- [ ] `CRON_SECRET` set and worker process running
- [ ] Demo hints hidden (default when `NODE_ENV=production` and
      `NEXT_PUBLIC_SHOW_DEMO` unset)
- [ ] Change or remove the seeded `demo@multipoststudio.app` account
- [ ] Integration keys set for whatever you're enabling; webhooks registered
- [ ] `/api/health` wired to the platform health check
- [ ] `npm test` and `npm run test:e2e` green in CI
