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

## 3. Switch the database to Postgres

Dev uses SQLite. For production:

1. Edit `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
2. Generate a first Postgres migration from a machine with `DATABASE_URL`
   pointing at an empty Postgres DB:
   ```
   npx prisma migrate dev --name init
   ```
   Commit the generated `prisma/migrations/**`.
3. On every deploy, run before starting the app:
   ```
   npx prisma migrate deploy
   npm run db:seed   # first deploy only, if you want demo data
   ```

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
