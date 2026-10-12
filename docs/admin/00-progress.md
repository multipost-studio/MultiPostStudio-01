# Admin platform: progress, completion matrix and known issues

_Last updated 2026-10-09. This file is the written checkpoint to resume from. Other documents in this folder:_
[01 route inventory](01-route-inventory.md) · [02 action inventory](02-action-inventory.md) · [03 gap analysis](03-gap-analysis.md) · [04 permission matrix](04-permission-matrix.md)

The inventories are generated from the code; regenerate rather than editing. The scanner used for 01 and 02 is a throwaway script, not part of the repository; its rules are described at the top of each file.

## Phases

| Phase | Scope | State |
|---|---|---|
| A. Discovery and baseline | route/action inventory, existing-module audit, gap matrix, baseline tests | **Done** (docs 01–04; baseline before changes: 1,676 tests passing, tsc clean, eslint 0 errors) |
| B. Stabilisation and security | authorisation gaps, audit gaps, input checks on directly-callable actions | **Done for what the audit found** (below). Remaining items are listed under known issues |
| C. Core operations | publishing ops, social integration centre, billing ops, customer 360, roles, incidents, global search, action centre | **Started**: global search done, action centre already existed; the rest not started |
| D. Governance | security ops, kill switches, release management, AI cost governance, data governance, compliance | Not started |
| E. Automation and analytics | lifecycle messaging, BI, automation management, support extensions | Not started |
| F. Validation | regression, security and responsive checks of everything new | Done for the work below only |

## Completion matrix

| Item | Status |
|---|---|
| Admin guard model (full / support) enforced on pages, actions, exports | **Verified** by `admin-guards.test.ts` and `platform-admin-guard.test.ts` (static + unit; not exercised with a live support account) |
| Global admin search | **Tested** (unit + route tests); header UI not visually verified in a browser this session |
| Audit gaps closed (flags, system-event purge, blog deletes/merge/settings, bulk comments) | **Tested** (`admin-flags-audit.test.ts`, `admin-audit-gaps.test.ts`) |
| Custom date ranges (revenue, acquisition, analytics, dashboard, AI call activity), quick date picks and number-range filters on admin lists, extra filters on users/orgs/invoices/jobs/audit, wider global search | **Tested** (pure logic and where-clauses); not browser-verified; customer reports builder not changed |
| Config history with restore, AI call log, incident ownership and postmortems, backup evidence log, policy versions, internal notes, reasons on money overrides, per-job retry history | **Tested** (unit/static); pages not browser-verified; need migrations `20261009180000` and `20261009200000` |
| Refunds with two-person approval, payment retry, scoped pauses (AI / publishing), editable lifecycle emails with versions and a delivery log, Resend delivery webhook, live Supabase backup status, reasons on all other sensitive actions | **Tested** (unit/static, gateways and Supabase mocked); **never run against a live Stripe, Razorpay, Resend or Supabase account**; pages not browser-verified; need migration `20261009220000` |
| Publishing ops: reschedule, overdue/stuck/out-of-retries views, safer retry | **Tested** (`admin-queue.test.ts`); page not browser-verified |
| Automation status page `/admin/automations` | **Tested** (`admin-automations.test.ts` for the status logic); page not browser-verified. Read-only by design |
| Customer 360 (org page shows tickets), billing ops, integration centre, security ops | Partial — see gap analysis |
| Roles and permissions (45 permission keys, 7 built-in roles, custom roles, time-limited assignments, `/admin/access`) | **Tested** (unit + static guard tests, 1,782 tests); not exercised in a browser or with live non-full accounts. Needs migration `20261009160000_admin_access_control` applied before deploy |
| Incident management, kill-switch scopes, config versioning | Not started |
| AI cost governance | Not started |
| Data governance and backup status | Not started — backup/restore status has no data source in this repo; needs the hosting provider's API or manual evidence entry |
| Lifecycle messaging, BI, automation management, compliance | Not started |

## Changes in this pass

Authorisation
- The old `requirePlatformAdmin()` only checked `isPlatformAdmin`, so a support admin could call any admin server action directly (the support restriction lived only in the edge proxy, which sees page navigations, not action POSTs). Access is now **permission-based**: every admin page (49) and action calls `requireAdminPermission(key)`; `requirePlatformAdmin()` remains only for roles/access and admin accounts. Exports need `data.export` plus the view permission of the data. Customer impersonation is full-admin only. Details: [04-permission-matrix.md](04-permission-matrix.md).
- New `/admin/access` page and `actions/admin-access.ts`: custom roles, time-limited assignments, reasons and audit on every change, notification to the person. Schema: `AdminCustomRole`, `AdminRoleAssignment`.

Audit and input hardening
- Feature-flag toggle and rollout changes are audited with from/to values; rollout rejects non-numbers (it could write `NaN`).
- Purging or dismissing system events, deleting blog categories/tags/authors, merging tags, bulk comment moderation and blog-settings updates are audited; bulk comment moderation is capped at 500 ids and validates its status; blog settings validate key shape, count and value size.

Search
- `lib/admin-search.ts`, `/api/admin/search`, `admin/admin-search.tsx` in the header. Each result type is searched only if the staff member holds its view permission. Only identifying fields are selected.

## Tests executed (this pass)

| Check | Result |
|---|---|
| Unit/integration (vitest, whole repo) | 203 files, 2,090 tests passing (baseline before this pass: 1,676) |
| Type check (`tsc --noEmit`) | clean |
| Lint | 0 errors (136 pre-existing warnings, none new) |
| Production build | passes |
| Playwright e2e | not run (needs the CI database); no new e2e for admin yet |
| Security tests with a live support-tier session | **not run**; the support-tier behaviour is covered by unit tests of the guards, not by an end-to-end session |

## Known issues and technical debt

1. **Sensitive actions have no reason capture, second approval or step-up authentication.** Roles now limit who can reach invoice/subscription overrides and credits (`billing.manage`), but a person who holds the permission can still use it without a reason or approver. Access changes (roles) do require a reason.
2. **Money overrides without gateway truth.** `setInvoiceStatusAction`, `setSubscriptionStatusAction` and `adjustOrgCreditsAction` change local records; they are audited but not reconciled against the provider at the time of the change.
3. **Nine mutating actions are unaudited** (routine blog upserts/uploads/autosave, comment moderation of a single comment, promo image upload, ticket reply by a customer). See doc 02.
4. **Support admins can search tickets and reply to any ticket**; they cannot see other admin pages. Ticket replies are not audit-logged (they are recorded on the ticket itself).
5. **No admin e2e coverage.** The new guard tests are static/unit; a Playwright test with a seeded support-tier user would close the loop and needs the CI database.
6. **Impersonation lasts one hour** (token TTL); there is no visible per-session record beyond the audit event and no reason field.
7. **Overview figures are computed per request**; fine at current size, but should be cached or pre-aggregated before it matters.

## Resume point

Module 6 is done (see the permission matrix). Next recommended step: reason capture on sensitive actions, then Module 3 (publishing operations: dead-letter view, reschedule, retry history) and Module 2 (refund and retry workflows, which also need the permission model and second approval). Each needs a migration; none has been started.
