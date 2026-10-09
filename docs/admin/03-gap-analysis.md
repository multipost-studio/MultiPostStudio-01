# Admin panel: existing functionality and gap analysis

_Reviewed 2026-10-09 against the code in this repository. "Evidence" names the file or page that was read; nothing here is inferred from how a page looks. A status of "Implemented" means code, data source and guard exist; it is not a claim that the page was exercised in a browser._

Status key: **Implemented** · **Partial** (works, with named gaps) · **Missing** · **Blocked** (needs an external dependency).

## A. The brief's existing modules

| Area | Status | Evidence | Gaps |
|---|---|---|---|
| Overview | Implemented | `lib/admin-analytics.ts`, `lib/mrr.ts`; MRR is per currency (USD and INR kept apart, active subscriptions only), covered by `revenue.test.ts` | No date-range/plan filters; no cohort, churn or funnel views; figures are computed per request |
| Marketing (acquisition, UTM, audiences, promo, festivals, footer, branding, reviews, broadcast) | Implemented | one page each + actions with `apply`/`logAudit` | No suppression list or per-user consent check on broadcast; no delivery analytics; no approval workflow |
| People & orgs (users, orgs, affiliates) | Implemented | `users/[id]` shows orgs, workspaces, OAuth accounts, devices, posts, audit trail; actions for suspend, delete/restore, force-verify, TOTP unlock, device revoke, impersonation | No ownership-transfer workflow; no resend-verification action; no bulk tools beyond CSV user import |
| Revenue (revenue, plans, billing) | Implemented | `revenue-db.ts`, `adapters/billing.ts`, webhooks with `WebhookEvent` idempotency, reconciliation job | No refund or payment-retry action through the gateway; no dunning view; no gateway-event log page; disputes are only audit-logged |
| Content (blog suite) | Implemented | `actions/blog.ts` (22 actions) | Routine upserts unaudited; no approval workflow; no revision history UI verified |
| Social & AI | Partial | `admin/posts`, `admin/ai` (provider credential status counts) | No AI request/cost/latency ledger, per-tenant quotas, fallback or circuit-breaker controls |
| Platform (flags, usage, connections, notifications, site settings, rules, design system) | Partial | flags have enable + rollout %; connections page lists status/expiry; usage page shows monthly metrics | No config versioning, rollback, approval or scheduled activation; no webhook-health or API-quota view |
| Operations (support, privacy, audit, security, queue, health, probes, observability) | Partial | each has a page; audit log has no update/delete path | See modules 3, 5, 7, 11, 15 below |

## B. The sixteen proposed modules

| # | Module | Status | What exists | What is missing |
|---|---|---|---|---|
| 1 | Customer 360° | Partial (2026-10-09: org page shows support tickets with `support.view`; users and orgs have internal notes) | user and org detail pages (above); org page shows invoices, members, workspaces, API keys, audit trail, tickets; private staff notes (`notes.view`/`notes.manage`) on both | usage/entitlement summary, notification history, tags, explainable churn-risk rules |
| 2 | Billing operations | Partial | plans, coupons, credits, invoice/subscription status overrides (audited), webhook idempotency, reconciliation | gateway refunds, retry payments, dunning schedule, event-log page, reconciliation report, two-person approval for money actions |
| 3 | Publishing operations | Partial (improved 2026-10-09) | `/admin/queue`: counts, filters, retry (now refuses running/finished jobs), cancel, bulk retry, manual run, **reschedule** a queued job, **overdue / stuck / out-of-retries** counts and filter, failure-kind hint per failed job; queue has CAS claiming, leases, backoff | retry history table (admin retries are in the audit log, which has no index on the target, so it is not joined into this page), org/user filters beyond text search, correlation IDs, bulk retry still fails as a whole if one post already has an active job |
| 4 | Social integration center | Partial | `/admin/connections` (status, expiry, API keys, webhooks) | scopes, last success/failure, quota/rate-limit state, provider webhook health and replay |
| 5 | Security operations | Partial | `/admin/security`: lockouts, 2FA adoption, device activity, privileged accounts | failed-login monitoring, suspicious-pattern rules, investigation cases and timelines |
| 6 | Roles and access governance | **Implemented 2026-10-09** | permission registry (40 keys, 2 of them super-only), 7 built-in roles, custom roles, time-limited assignments with mandatory reasons, `/admin/access`, permission-scoped pages/actions/exports/search — see [04-permission-matrix.md](04-permission-matrix.md) | resource/org-scoped access, two-person approval, step-up MFA, periodic access reviews; migration `20261009160000_admin_access_control` must be deployed |
| 7 | Incidents and reliability | Partial (2026-10-09) | health probes with history and derived incidents; each incident can be taken on: owner, status, written postmortem, audited, owner notified | maintenance windows, escalation, a combined timeline |
| 8 | Kill switches and safe mode | Partial | feature flags (incl. platform AI switch), maintenance mode in site settings | scoped (provider/tenant) switches, reason field, scheduled expiry, rollback |
| 9 | Configuration and release management | Partial (2026-10-09) | `/admin/config-history`: every save/reset of branding, footer, festival themes, review settings and health settings is kept as a revision (last 50 each), with a summary of what changed, and can be restored with a reason | approval, scheduled activation, org/plan targeting; site settings and platform rules are not versioned yet |
| 10 | AI operations and cost governance | Partial (2026-10-09) | credential status; call log (provider, model, ok/failure class, latency, sizes, no text) with per-provider success rate and latency, failure reasons and busiest workspaces, 90-day retention | dollar cost (keys are the customers', so there is none to show), quotas, fallbacks, circuit breaker |
| 11 | Data governance and recovery | Partial (2026-10-09) | `/admin/privacy-requests`, `docs/DPDP-*.md`; `/admin/recovery` is a hand-kept, append-only record of backup checks and restore tests with overdue warnings (this app cannot read the host's backups) | live backup status from the database host, retention jobs UI, secure export links |
| 12 | Lifecycle messaging | Partial | in-app broadcast, transactional emails, notification centre (customer side) | templates and versions, test send, delivery/bounce analytics, frequency caps, unsubscribe tracking |
| 13 | Business intelligence | Partial | overview, acquisition, revenue | funnel, cohorts, churn/NRR/GRR, saved reports; CAC/LTV need cost data that is not captured |
| 14 | Automation management | Partial (2026-10-09) | `/admin/automations`: last run and late/never/healthy state for the tick, social syncs, housekeeping, reminder jobs, billing reconciliation and weekly digest (from the scheduler's own stamps), plus 24 h customer-automation outcomes and recent failures | run duration and per-run result history (the jobs do not record them), per-job pause/disable and manual run (the product has no per-job switch to wire to) |
| 15 | Support desk | Partial | tickets, assignment, priority, status, staff/customer replies | SLA tracking, internal notes, attachments verified, incident linkage |
| 16 | Compliance and policy | Partial (2026-10-09) | `/admin/policies`: append-only published versions of terms, privacy, DPA and cookie policies with effective dates and the version in force | customer acceptance and consent records, showing the policy to customers |

## C. Platform-wide capabilities

| Capability | Status | Notes |
|---|---|---|
| Global search | **Implemented 2026-10-09** | `lib/admin-search.ts`, `/api/admin/search`, header box (press `/`). Users, organisations, tickets, invoices; support admins see tickets only. Posts, jobs, incidents and connected accounts are not searched yet |
| Universal audit logging | Mostly implemented | `logAudit` on money, access, flags, config, deletes. 9 low-risk mutating actions remain unaudited (listed in [02-action-inventory.md](02-action-inventory.md)) |
| Safe bulk operations | Partial | bulk retry of failed jobs, bulk comment moderation (capped at 500, validated, audited since 2026-10-09), user CSV import |
| Administrative action centre | Implemented | `/admin/notifications` is fed by `lib/admin-signals.ts`: waiting/unassigned tickets, past-due subscriptions, unpaid invoices, ending trials, broken social/integration connections, system errors, webhook failures, probe failures |
| Environment indicators / read-only mode | Not verified | maintenance mode exists; no staging-vs-production banner found |

## D. Verified defects fixed in this pass

See [00-progress.md](00-progress.md#changes-in-this-pass).
