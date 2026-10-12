# MultiPost Studio: RSLA (row-level security / access control) audit

Date: 2026-10-12. Method: static, read-only inspection of the repository. No database, Supabase, Vercel or production endpoint was contacted.
Severity labels follow the request: Critical, High, Medium, Low, Informational. Every finding states **Confirmed** (the code unambiguously does it), **Suspected** or **Unverified** (needs evidence I could not obtain), and whether the source is static inspection or runtime testing. **No runtime testing was done.**

## 1. Executive summary

- The application does **not use Supabase RLS for authorization**. There are 123 Prisma models and 60 migrations, and **none contains `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, `GRANT`, `REVOKE`, `SECURITY DEFINER`, a view or a function**. The app has no Supabase client; every query goes through Prisma over a direct Postgres connection as the project's `postgres` role, which bypasses RLS. Tenant isolation is therefore **entirely application-layer**.
- The application layer is, on the whole, well built. A static scan of all 383 exported server actions found every customer-side mutation either calls `ensureInWorkspace` / `ensureInOrg` / an `own*()` helper or filters by `workspaceId` / `orgId`. Every `route.ts` handler is either gated (session, API key, cron secret, webhook signature, signed state) or intentionally public and rate limited (health, festival banner, consent, visit tracking). Webhooks fail closed when their secret is missing. API keys are hashed, org-scoped and rate limited. Billing confirmation binds the provider subscription to the org.
- The biggest **unverified** risk sits outside the repo: if Supabase's Data API (PostgREST) is enabled for the `public` schema, tables created by Prisma have RLS off and Supabase's default grants give `anon` and `authenticated` access. That would bypass every application check. I could not check this without querying the live project (RSLA-01).
- The biggest **confirmed** defect is a role bug in team management (RSLA-02): inviting someone creates a workspace row forced to `editor`, which overrides their organisation role, and changing their role later has no effect in that workspace.
- Overall: **application-layer authorization is good; there is no database-level defence in depth; one high-impact logic bug and one high-impact unverified exposure need action before the app is called production-ready for sensitive tenants.**

Overall risk (pending RSLA-01 verification): **Medium-High**. If RSLA-01 is confirmed exposed: **Critical**.

## 1a. Remediation status (updated 2026-10-12, same day)

The fixes below were made after the audit, in code only. Nothing was applied to any database or deployed. Checks run afterwards: type-check clean, ESLint 0 errors (136 warnings, unchanged), 214 test files / 2,226 tests passing, `next build` succeeds. These are unit tests with mocks; none ran against a live database, Supabase or Vercel.

| ID | Status | What changed |
|---|---|---|
| RSLA-01 | **Fix written, you must apply it** | New migration `prisma/migrations/20261012100000_rls_lockdown`. Run the verification SQL in RSLA-01 first, then `npx prisma migrate deploy`. Validated on an in-memory Postgres: no-op without the Supabase roles, RLS on and grants removed with them, idempotent, owner still reads. Not run against Supabase |
| RSLA-02 | Fixed in code | Invites write a workspace row that mirrors the invited role; `effectiveRole()` never lets a workspace row reduce an owner or admin; changing someone's org role moves their matching workspace rows. **Existing wrong rows are not changed automatically** (see "Cleaning up existing members" below) |
| RSLA-03 | Fixed | Support sessions are stored server-side (`ImpersonationSession`): ending one, expiry, or demoting the administrator stops it at once, and the cookie alone proves nothing. Sessions are **read-only by default**; an edit session needs a written reason, lasts 30 minutes and still cannot touch members, billing, connections or security settings. "End support sessions" on the customer's admin page ends every live one. The token uses the real auth secret, account-control actions are refused, and audit and activity records name the real administrator |
| RSLA-04 | Built, **off by default** | `Workspace.restricted`. Restricted = only owners/admins and people added to it can open the workspace; it disappears from the switcher, `/switch`, the agency pages and a stale cookie. Owners and admins always have access, and the app refuses any change that would leave someone with no workspace. Controls are on Team → Workspace access. API keys remain organisation-wide by design |
| RSLA-05 | Fixed | OAuth completion re-checks active membership and `channels.connect` with today's role, and enforces the plan channel limit (reconnecting an existing account is never blocked; GBP is limited at location selection). New error codes shown on Integrations |
| RSLA-06 | Fixed | Invoice documents need `billing.manage` (org role) |
| RSLA-07 | Fixed | Analytics CSV export needs `analytics.view` |
| RSLA-08 | **Open, your action** | Confirm the Vercel variables listed there. Not changed in code, to avoid breaking a deployment |
| RSLA-09 | Fixed | The placeholder connect action refuses in production |
| RSLA-10 | Code done, **bucket check is yours** | New objects use `uploads/<workspaceId>/YYYY/MM/<uuid>`, registering a file checks that prefix, thumbnails now use the same private-naming layout. The live bucket's policies cannot be seen from the repo: use `docs/security/storage-bucket-checklist.md` |
| RSLA-11 | Partly | Dead model names removed from `ensureInWorkspace`; `*.db` added to `.dockerignore`. Mandatory approvals are built (see below). Left as is: `/switch` GET (needed by invite emails), plaintext webhook secrets, DNS-rebinding window, audit-log immutability, portal rate limit |

### Added after the first round (all off or read-only by default)

| Item | Status |
|---|---|
| Mandatory approvals | `Workspace.requireApproval`, **off by default**. On: a post cannot be scheduled, queued, published now or set up through the API until its current text has been approved; editing after approval sends it back; the publish worker holds an unapproved post as a draft at the last moment instead of publishing it. Switch is on the Approvals page |
| Migration to apply | `20261012200000_workspace_access_support_sessions_approvals` (adds two Workspace columns that default to today's behaviour and the sessions table) |

Everything above was checked with type-check, ESLint (0 errors), 224 test files / 2,335 tests and `next build`; the SQL was run on an in-memory Postgres. None of it has run against your live database or Supabase.

### Cleaning up existing members (RSLA-02)

Before this change every invite wrote an `editor` workspace row. Rows already in the database were not touched, because a deliberate "editor in this workspace" override looks identical to the old default. See who is affected (read-only, run in the Supabase SQL editor):

```sql
select u.email, m.role as org_role, wm.role as workspace_role, w.name as workspace
from "WorkspaceMember" wm
join "Workspace" w on w.id = wm."workspaceId"
join "Membership" m on m."orgId" = w."orgId" and m."userId" = wm."userId"
join "User" u on u.id = wm."userId"
where wm.role = 'editor' and m.role in ('creator','analyst','viewer')
order by w.name, u.email;
```

Each row is someone acting as an editor although their organisation role is lower. Re-saving that person's role in Team now fixes their rows, or set the role you want in SQL after deciding. Members invited as `admin` or `manager` are no longer reduced, with no data change needed.

## 2. Architecture and security boundaries

| Layer | What exists | Evidence |
|---|---|---|
| Edge | `src/proxy.ts`: cookie-presence gate for app routes, host redirects, support-tier admin bounce. Explicitly not authoritative | `src/proxy.ts:1-130` |
| Authn | NextAuth, JWT sessions, credentials + Google, `allowDangerousEmailAccountLinking: false`, TOTP, login rate limits. `getCurrentUser()` re-reads the user each request, so suspension/deletion takes effect at once | `src/auth.ts`, `src/lib/session.ts:34-105` |
| Authz (customer) | Org role + optional workspace override + optional custom role; `withPermission()` then `ensureInWorkspace()` / `ensureInOrg()`; static tests | `src/app/actions/_helpers.ts`, `src/lib/rbac.ts`, `src/lib/tenant-guards.ts` |
| Authz (platform admin) | `requireAdminPermission(key)`, super-only `requirePlatformAdmin`, route handlers use `hasAdminPermission`. A static test requires every admin page and action module to use a guard | `src/lib/session.ts:117-185`, `src/app/admin/admin-guards.test.ts` |
| Public API | `/api/v1/*`, API-key bearer, scopes, org-scoped queries, per-plan rate limit | `src/lib/api/auth.ts`, `src/lib/api/handler.ts` |
| Data access | Prisma → Supabase Postgres via Supavisor as `postgres.<ref>`. No RLS, no Supabase JS client | `src/lib/db.ts`, `prisma/migrations` (grep: 0 hits) |
| Storage | S3-compatible bucket (Supabase Storage/R2/S3), public URLs, keys `uploads/YYYY/MM/<uuid>.<ext>` | `src/lib/adapters/storage.ts` |
| Secrets | OAuth tokens AES-256-GCM (`TOKEN_ENC_KEY`), API keys sha256, TOTP sealed, webhook secrets plaintext | `src/lib/social/crypto.ts`, `src/lib/api/auth.ts` |
| Jobs | `/api/cron/tick`, `/api/cron/digest`: bearer `CRON_SECRET`, constant-time compare, fail-closed in production | `src/lib/cron-auth.ts` |

## 3. Findings

### RSLA-01: No RLS or grant hardening on a Supabase `public` schema (High, potentially Critical). Unverified, static
- **Where:** all 123 tables in `prisma/schema.prisma`; `prisma/migrations/*` (60 files).
- **Concern:** nothing in the repo enables RLS or revokes the default `anon` / `authenticated` privileges Supabase applies to new `public` tables. If the project's Data API exposes `public`, the project's anon key (public by design) could read or write every table, including `User`, `SocialAccount` (encrypted tokens), `Invoice`, `ApiKey` (hashes), `AuditLog`.
- **Evidence:** `grep -riE "ROW LEVEL SECURITY|CREATE POLICY|GRANT |REVOKE |SECURITY DEFINER"` over `prisma/migrations` returns nothing. No `@supabase` package or client in `package.json`/`src`, so the anon key is not shipped with the app (which lowers, but does not remove, the risk: exposure needs the key). The runtime connection user is `postgres.<ref>`, the project's `postgres` role (which has `BYPASSRLS`).
- **Exploitation:** someone who obtains the anon key (leak, former contractor, dashboard access) calls `https://<ref>.supabase.co/rest/v1/<Table>` and reads or mutates rows across tenants, with no application code involved.
- **Impact:** total loss of tenant isolation, privacy and integrity.
- **Status:** unverified. Settings live in Supabase, not the repo.
- **Safe verification (you run in the Supabase SQL editor, read-only):**
  ```sql
  select schemaname, tablename, rowsecurity from pg_tables where schemaname='public' and not rowsecurity;
  select grantee, table_name, privilege_type from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated') limit 50;
  select rolname, rolbypassrls from pg_roles where rolname in ('postgres','anon','authenticated');
  select * from pg_policies where schemaname='public';
  ```
  Also check Dashboard → Settings → API → "Exposed schemas" / Data API toggle.
- **Remediation (not applied):** turn the Data API off for `public` (the app does not use it) **or** enable RLS with no policies on every table and revoke `anon`/`authenticated` privileges; add a migration template so future tables follow suit.
- **Regression risk:** low if the Prisma role is `postgres` (BYPASSRLS, confirm with the third query). High if a different non-bypass role is ever used. Do it in staging first. Supabase's own backup/management features are unaffected.

### RSLA-02: Invited members get forced `editor` rights and role changes do not take effect (High). Confirmed, static
- **Where:** `src/app/actions/team.ts:113-115` (`inviteMemberAction`), `team.ts:153-173` (`updateMemberRoleAction`), `src/lib/session.ts:225,241`.
- **Concern:** the invite transaction creates `WorkspaceMember { role: "editor" }` for the inviting workspace whatever org role was chosen. The effective role is `workspaceRole ?? orgRole` (`session.ts:241`), so the row wins. `updateMemberRoleAction` changes only `Membership.role` and never touches that row.
- **Exploitation (no attacker needed, ordinary use):** invite someone as `viewer`, `analyst` or `creator` and they act as `editor` (publish, delete content, manage media, respond in inbox) in that workspace. Later "demote" them and the success toast shows but their rights stay at editor. Inviting an `admin` or `manager` has the opposite effect: they are cut to `editor` there (no `members.manage`).
- **Impact:** privilege escalation beyond what the inviter intended; role changes silently ineffective; data integrity (unwanted publish/delete).
- **Remediation:** create the row with a workspace role derived from the invited org role (or no row at all and let the org role apply), and update or clear the row when the org role changes; add a test that the effective role equals the granted role. **Regression risk:** changes effective permissions of existing members; run a read-only report of members whose workspace row differs from their org role before shipping.
- **Safe verification (staging, synthetic users):** invite a synthetic `viewer`, log in as them, attempt a publish action, then demote and retry.

### RSLA-03: Impersonation is unrestricted and attributes actions to the customer (Medium). Confirmed, static
- **Where:** `src/lib/session.ts:64-98`, `src/lib/impersonation.ts`, `src/app/actions/impersonation.ts`. The only read-only guard is in `notifications.ts:32`.
- **Concern:** while impersonating, `ctx.user` is the customer. Every customer action runs with full rights, and `logActivity`/`logAudit` record the customer as actor. Only start and stop are audited, with the real admin id. The token is a stateless 1-hour HMAC with no server-side revocation; verification does not re-check that the admin is still unrestricted (`platformRole == null`). `getSecret()` falls back to the constant `"fallback-secret-for-dev-only-min16"` and, in a deployment missing `AUTH_SECRET`, to the public placeholder, instead of `requireAuthSecret()`.
- **Impact:** weak accountability for support access; a malicious or compromised admin can change customer data with the customer named in the trail.
- **Remediation:** default to read-only impersonation, block sensitive actions (members, billing, API keys, integrations), carry `impersonatorId` into every audit/activity row, use `requireAuthSecret()`, add a token id for revocation. **Regression:** support staff lose write access unless an explicit "edit mode" is added.

### RSLA-04: No workspace boundary inside an organisation (Medium). Confirmed, static; design question
- **Where:** `src/lib/session.ts:193-229`.
- **Concern:** every active org member can select any non-archived workspace in the org and gets their org role there. `WorkspaceMember` only overrides the role; it never restricts access. In agency setups a user added for Client A can open Client B's workspace (assignment lists do require a `WorkspaceMember`, access does not).
- **Impact:** cross-client data exposure within one org (analytics, drafts, inbox). Tenant isolation **between organisations** is intact.
- **Remediation:** add an optional "restricted workspace" mode that treats `WorkspaceMember` as an allow-list. **Regression:** behaviour change for existing agency orgs; needs a migration plan.

### RSLA-05: OAuth connect bypasses the plan channel limit and rechecks nothing at completion (Medium). Confirmed, static
- **Where:** `src/lib/social/oauth.ts:117-180` (`completeAuthorization`), `src/app/api/oauth/[platform]/start/route.ts`. `maxChannels` is enforced only in `actions/integrations.ts:32,99` and `actions/gbp-locations.ts:175`.
- **Concern:** the real-platform connection path (Meta, LinkedIn, X, TikTok, YouTube, Pinterest, Threads) never calls `limitGuard`, so a workspace can attach more accounts than its plan allows. The callback also does not re-check that the user is still an active member with `channels.connect` (state lives 10 minutes).
- **Impact:** billing integrity; a removed member could finish a flow started earlier.
- **Remediation:** run the same `limitGuard` and a membership/permission recheck in `completeAuthorization`. **Regression:** orgs already over limit would be unable to reconnect; allow reconnecting an existing handle.

### RSLA-06: Invoice documents need no billing permission (Medium). Confirmed, static
- **Where:** `src/app/api/billing/invoice/[id]/route.ts:34-38`.
- **Concern:** `requireWorkspace()` plus an org match is all that is required. Any member, including `viewer` and the external `client` workspace role, can open invoices that show billing name, email, address and tax ID.
- **Remediation:** `assertPermission(ctx.active.orgRole, "billing.manage")`, matching `billing.ts`.

### RSLA-07: Analytics CSV export skips the `analytics.view` check (Low). Confirmed, static
- **Where:** `src/app/api/analytics/export/route.ts:22-40`. Built-in roles all hold `analytics.view`, but a custom role without it can still export.
- **Remediation:** require `analytics.view` in the handler.

### RSLA-08: Production configuration to confirm (Medium). Unverified
- Local `.env` (names only, no values read out): `TOKEN_ENC_KEY`, `STRIPE_WEBHOOK_SECRET`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `RESEND_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY` are empty. `AUTH_SECRET`, `CRON_SECRET`, Upstash and Razorpay webhook secret are set. Local is not proof of Vercel.
- If `TOKEN_ENC_KEY` is missing in production, `crypto.ts:15-27` throws and no stored social token can be read: connecting and publishing break. The webhook receivers all fail closed (501/503/401) without their secrets, so empty values disable those integrations rather than exposing them.
- Without Upstash in production, `rate-limit.ts` falls back to per-instance memory, which weakens login/TOTP/API limits on serverless.
- `AUTH_SECRET="change-me-min-16-chars"` from `.env.example` passes the 16-char check; add a denylist.
- **Verify:** Vercel → Settings → Environment Variables (presence only).

### RSLA-09: Stub account creation reachable in production (Low). Confirmed, static
- `connectAccountAction` (`actions/integrations.ts:21-63`) creates a "connected" account with a `stub_` token and has no production gate; only the UI hides it. Simulation is disabled in production (`queue.ts:26`), so these accounts cannot fake-publish, but they consume plan quota and pollute data. **Fix:** refuse when `isProduction`.

### RSLA-10: Storage objects are public, un-prefixed and un-policied in the repo (Low). Unverified bucket policy
- Keys have no tenant prefix and every object is served by a public URL with `Cache-Control: public` (`storage.ts:28-60,127`). Secrecy rests on the 122-bit UUID. Presigned PUTs are bound to size and a server-chosen key, so path manipulation is not possible. `registerMediaAction` accepts any URL on our storage host, so a tenant who learns another tenant's URL could register it. Bucket policies are not in the repo.

### RSLA-11: Smaller items (Low / Informational)
- `GET /switch?ws=` sets the active-workspace cookie on a GET (cross-site navigation can flip it); membership is validated, so it only moves a user between workspaces they already belong to.
- Customer webhook signing secrets are stored in plaintext and revealable (`webhooks.ts:79-88`, needs `integrations.manage`). The SSRF guard resolves DNS then fetches (a rebinding window remains); the IPv6 checks omit NAT64/6to4.
- `AuditLog` is described as immutable but nothing at database level prevents update/delete; code never mutates it.
- `ensureInWorkspace` lists `approvalWorkflow`, `brandVoice`, `webhookEndpoint`, which are not Prisma models (unused; would throw, failing closed).
- Approval workflows: I found no check in `actions/posts.ts` or `lib/adapters/queue.ts` that an approval must be granted before scheduling/publishing. If approvals are meant to be mandatory this is a gap (unverified). API v1 keys are org-wide and schedule posts without a user role check (by design, owner/admin attribution).
- `src/app/ruvector.db` (1.5 MB local tool database) is git-ignored but not in `.dockerignore`, so Docker builds would copy it.
- Portal pages (`/portal/[token]/*`) read without the IP rate limit that `/share/report/*` has; tokens are 160-bit so enumeration is not realistic.

## 4. Controls that held up (evidence)

- Customer mutations: of 383 exported actions scanned (a heuristic, not proof), none on the customer side writes or reads by id without a tenant marker once helper-based ownership checks (`ownConversation`, `own`, `ensureInWorkspace`) are counted. 5 residual hits are user-scoped (2FA, profile) or AI actions. Platform-admin actions are platform-wide by design and were checked for their permission guard instead.
- Pages: no customer `page.tsx` reads a record by bare id without workspace/org/user filter.
- Public API: every query is constrained by `orgId`; `workspaceId` parameters are intersected with it; channels are re-checked inside the workspace; scopes and plan rate limit enforced; mutating calls pass a CSRF origin check and a 2 MB cap.
- Webhooks: Razorpay HMAC, Stripe `constructEvent`, Resend Svix, Meta `x-hub-signature-256` (fail closed in production), Threads signed requests; idempotent event claims.
- OAuth: signed state with expiry and nonce, state cookie equality, session user must equal the user who started the flow, per-IP rate limits, no raw errors in redirects.
- Admin: every admin API route checks a named permission; support-tier staff are fenced at the proxy and in code; impersonation start is super-admin only, cannot target other admins, and is audited.
- Billing: `billing.manage` from the org role only; paid plans refused without a provider in production; Razorpay confirmation binds `notes.orgId` to the caller's org.
- Secrets: API keys sha256 with constant-time compare; OAuth tokens AES-GCM; credentials never selected into page props (explicit `select` with comments); `.env*` never committed (git history checked); `.gitignore` covers keys and credentials.

## 5. Audit coverage matrix

| Component | Inspected | Evidence available | Risk | Recommended action |
|---|---|---|---|---|
| Supabase RLS policies | Repo only | None in repo; live state not queried | High (unverified) | Run the SQL in RSLA-01; disable Data API or enable RLS |
| Table grants (`anon`/`authenticated`) | Repo only | None | High (unverified) | Same as above |
| Views, RPC functions, SECURITY DEFINER | Yes | None exist in migrations | Low | Re-check live DB for dashboard-created objects |
| Server actions (customer) | Yes, all 383 by scan, samples read | Strong | Low | Add the checks in RSLA-02/05 |
| Server actions (admin) | Yes, guard coverage | Strong, static test exists | Low | Keep `admin-guards.test.ts` |
| API routes | Yes, all `route.ts` | Strong | Low-Medium | RSLA-06/07 |
| Public API v1 | Yes | Strong | Low | Document org-wide key semantics |
| Webhooks | Yes | Strong | Low | Confirm production secrets (RSLA-08) |
| OAuth flows | Yes | Good | Medium | RSLA-05 |
| Session/JWT, 2FA | Yes | Good | Low | Add secret denylist |
| Impersonation | Yes | Weak accountability | Medium | RSLA-03 |
| Org/workspace isolation | Yes | Org boundary strong; workspace boundary weak | Medium-High | RSLA-02/04 |
| Storage buckets/policies | Adapter only | Bucket config not visible | Medium (unverified) | Inspect bucket public/private settings and policies |
| Cron / background jobs | Yes | Strong | Low | n/a |
| Rate limiting | Yes | Good if Upstash is set in prod | Medium (unverified) | Confirm Upstash in Vercel |
| Environment variables in Vercel | No | Local `.env` presence only | Medium (unverified) | Confirm in dashboard |
| DB performance of authz (indexes, query counts) | Light | 34 migrations add indexes; 385 `findMany` calls, an egress guard exists | Low | Measure in staging |
| Runtime behaviour of any finding | No | None | n/a | Staging plan below |

## 6. Remediation roadmap

1. **Now (no code risk):** run the RSLA-01 queries; confirm Vercel variables (RSLA-08); inspect bucket settings.
2. **Next release:** RSLA-02 (role bug) with a read-only report of affected members first; RSLA-06 and RSLA-07 (one-line permission checks); RSLA-09 production gate.
3. **Soon:** RSLA-05 (limit + recheck), RSLA-03 (impersonation read-only and attribution).
4. **Planned:** RSLA-01 hardening migration (after verifying the connection role), RSLA-04 workspace allow-list option, storage prefixing/private bucket mode.

## 7. Safe staging test plan (synthetic users and data only)

1. Two orgs A and B, each with an owner, a `viewer`, an `editor`. Using each user's own session, try every by-id server action and route with an id from the other org; expect "not found".
2. RSLA-02: invite a `viewer`, attempt publish/delete, demote, retry; invite an `admin`, check `members.manage`.
3. RSLA-05: connect more OAuth accounts than the plan allows (sandbox apps).
4. RSLA-06/07: call invoice and CSV routes as a `viewer` and as a custom role without `analytics.view`.
5. RSLA-01: with a copy of the schema, call PostgREST with the anon key before and after hardening.
6. Impersonation: as a test admin, impersonate a test customer, perform a write, confirm what the audit trail shows.

## 8. Regression and rollback

Every fix above is additive or tightening. Roll back by reverting the commit; for the database hardening, `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` and re-grant. Stage the role-bug fix behind a dry-run report because it changes live permissions.

## 9. Production-readiness recommendation

Do not describe the app as fully verified-secure. It is reasonable to continue operating on the application-layer controls for ordinary use, **provided RSLA-01 is checked this week**. Do not onboard multi-client agency customers, or customers who invite external viewers, until RSLA-02 is fixed. Items I could not inspect: live RLS/grant state, bucket policies, Vercel environment, Supabase Auth/API settings, and runtime behaviour.

## 10. Safety confirmation

This section describes the read-only audit phase. The code changes made afterwards are listed in section 1a; they touched no database, policy, deployment or production data.

- **Source code changed:** no.
- **Files created:** this report (`docs/security/rsla-audit-2026-10-12.md`) and one throwaway read-only scan script in the session scratchpad outside the repo.
- **Database records or schema changed:** no. No query was sent to any database.
- **RLS policies or permissions changed:** no.
- **Deployments, restarts, builds, test runs:** none during this audit.
- **Production data accessed:** none. I read `.env` for whether variables are set (set/empty only). The `DATABASE_URL`/`DIRECT_URL` lines were displayed with the password masked, which exposed the project reference and region in the session transcript; no secret value was shown.
- **Tests skipped to protect production:** all runtime and cross-tenant tests, any call to Supabase APIs, load or performance tests, OAuth flows, webhook posting, impersonation.
- **Findings needing staging verification:** RSLA-01, 02, 03, 05, 06, 07, 08, 10 (and the approval-workflow note in RSLA-11).
