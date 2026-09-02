# Cadence — AI-Powered Social Media Operating System

An original, production-shaped SaaS platform covering the full social workflow:
**Ideate → Create → Plan → Approve → Publish → Engage → Analyze → Optimize.**

Inspired by the product category Buffer defined; entirely original brand, design system,
schema and implementation.

## Stack

- **Next.js 16** (App Router, RSC, Server Actions) + **React 19** + **TypeScript**
- **Tailwind v4** + a custom token-based design system (light + dark)
- **Prisma 6** + **SQLite** (Postgres-ready — swap the datasource provider)
- **Auth.js v5** — credentials + Google (env-gated) + JWT sessions, device table, stub 2FA
- **Recharts** charts, **dnd-kit** drag-and-drop
- Stub adapters (swap for real infra without touching callers):
  - `lib/adapters/ai.ts` — deterministic, offline content generator (real prompt shape)
  - `lib/adapters/queue.ts` — DB-backed publish queue, driven by `/api/cron/tick`
  - `lib/adapters/billing.ts` — plan changes + invoices (drop in Stripe Checkout)
  - `lib/adapters/webhooks.ts` — signed-delivery recorder
  - `lib/adapters/storage.ts` — local `/public/uploads` (swap for S3/R2)
  - `lib/adapters/automations.ts` — WHEN/THEN rule engine

## Getting started

```bash
npm install
npm run db:migrate      # apply schema
npm run db:seed         # rich demo data (Northwind Studio agency, 3 workspaces)
npm run dev
```

Open http://localhost:3000 — **demo login: `demo@cadence.app` / `demo1234`** (also a platform admin).

`npm run build` runs `prisma generate` then `next build`.

## Modules

Auth & onboarding · Multi-workspace (brand + client) · Ideas Kanban · AI Content Studio
(captions / ideas / hooks / repurpose / blog→posts / rewrite) · Universal Composer with
per-channel editing, live previews, media, first comment, UTM, prediction scoring ·
Calendar (month/week/day/list, drag-to-reschedule) · Queue + AI scheduling · Community Hub
(unified inbox, AI replies, sentiment, assign, saved replies) · Analytics (overview /
content / audience) · AI Insights (what/why/what-next) · Trends · Competitor Intelligence ·
Content Opportunities · Media Library · Templates · Campaigns · Automation Engine ·
Evergreen Recycling · Multi-stage Approvals with immutable approved snapshots + audit trail ·
Team (org + workspace roles, RBAC) · Integrations (social OAuth stub + app catalog) ·
Reports (white-label, share links, schedule) · Agency overview · Settings (profile /
security / devices / workspace + posting schedule / Brand Brain / notifications / billing +
usage meters / API keys + webhooks) · Platform Admin (users / orgs / plans / feature flags /
usage & API / support / audit log / system health) · Notification center · Social Health
Score · Content Goals · Prediction-vs-actual learning loop.

## Notes

- Every mutation is a permission-checked Server Action; entities are workspace-scoped.
- `TickPoller` in the app shell hits `/api/cron/tick` every ~20s so scheduled posts publish
  and automations run while the app is open — replace with a real cron in production.
- `AUTH_SECRET` in `.env` is a dev placeholder. Set real secrets before deploying.
