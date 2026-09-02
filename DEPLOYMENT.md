# Deploying Cadence

Cadence ships **dual-mode**: every external integration has a real
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

The schema targets Postgres. There are **no committed migrations** — generate
the baseline once against your database:

```
# DATABASE_URL points at an empty Postgres DB (use the *direct*, non-pooled
# Neon string here, not the pooler)
npx prisma migrate dev --name init
git add prisma/migrations && git commit -m "chore: postgres baseline migration"
```

After that, every deploy runs `prisma migrate deploy` automatically
(`npm run vercel-build`, or add it to your host's build/release step). Seed
demo data on the first deploy only if you want it: `npm run db:seed`.

Local dev also uses Postgres now — point local `DATABASE_URL` at a Neon branch
(or `docker compose up db`).

---

## Vercel quickstart (Vercel + Neon)

1. **Neon** → create a project → copy both connection strings (pooled +
   direct). Neon dashboard → *Connection Details*.
2. **Baseline migration** (once, locally): set `DATABASE_URL` to the **direct**
   string, run `npx prisma migrate dev --name init`, commit
   `prisma/migrations/`.
3. **Push** the repo to GitHub.
4. **Vercel** → *Add New → Project* → import the repo. Root directory:
   `cadence`. It auto-detects Next.js; `vercel.json` sets the build command.
5. **Env vars** (Project → Settings → Environment Variables), Production +
   Preview:
   | var | value |
   |-----|-------|
   | `DATABASE_URL` | Neon **pooled** string |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `APP_URL` | `https://<project>.vercel.app` (set after first deploy, then redeploy) |
   | `CRON_SECRET` | `openssl rand -hex 24` |
   | `TOKEN_ENC_KEY` | `openssl rand -base64 32` |
   | `NEXT_PUBLIC_SHOW_DEMO` | leave unset (hides demo hints) |
   | *(optional)* `ANTHROPIC_API_KEY`, `RESEND_API_KEY` + `EMAIL_FROM`, `S3_*`, `OAUTH_*` | as you enable each |
6. **Deploy.** `vercel-build` runs `prisma migrate deploy` then `next build`.
7. **Set `APP_URL`** to the real deployment URL and redeploy (needed for auth
   callbacks + email links).
8. **Cron:** `vercel.json` registers a 1-minute cron on `/api/cron/tick`.
   Vercel Cron at that frequency needs the **Pro** plan. On **Hobby**, delete
   the `crons` block and instead point a free external scheduler
   (cron-job.org, EasyCron, GitHub Actions) at
   `POST https://<project>.vercel.app/api/cron/tick` every minute with header
   `Authorization: Bearer <CRON_SECRET>`.
9. **First account:** `npm run db:seed` (creates `demo@cadence.app`) then
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

### Stripe
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
- [ ] Change or remove the seeded `demo@cadence.app` account
- [ ] Integration keys set for whatever you're enabling; webhooks registered
- [ ] `/api/health` wired to the platform health check
- [ ] `npm test` and `npm run test:e2e` green in CI
