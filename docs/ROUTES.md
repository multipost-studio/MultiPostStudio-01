# Route Inventory — MultiPost Studio

Auth: **public** (no session) · **user** (signed in) · **member** (workspace) · **admin** (platform admin).
Every `(app)/*` route inherits the workspace shell, the offline banner, `(app)/loading.tsx`
(or its own tailored skeleton), `(app)/error.tsx`, and `(app)/not-found.tsx`.

## System / error routes

| Route | Purpose | Auth | Mobile | Notes |
|---|---|---|---|---|
| `not-found.tsx` (root) | Branded 404 | public | full-viewport, stacked CTAs | primary → dashboard, secondary → home, help links |
| `(app)/not-found.tsx` | Scoped 404 inside the workspace shell | member | keeps sidebar | `EmptyState` + dashboard CTA |
| `global-error.tsx` | Root error boundary (layout-level failures) | public | inline-styled, dependency-free | renders own `<html>`, shows `error.digest`, Reload / Home |
| `(app)/error.tsx` | Route-segment error boundary | member | inline | `ErrorState` + `reset()` |
| `/401` | Session ended / not signed in | public | full-viewport | Sign in / Home, reset-password link |
| `/403` | Access denied (role lacks permission) | public | full-viewport | Dashboard / Workspace, contact-admin link |
| `/500` | Server error (navigable) | public | full-viewport | `ReloadButton` + dashboard, support & status links |
| `/503` | Service temporarily unavailable | public | full-viewport | Retry + status page |
| `/maintenance` | Planned maintenance | public | full-viewport | Check again + status; `(app)/layout` also renders an inline maintenance screen when `settings.maintenanceMode` |
| `/offline` | No connectivity fallback | public | full-viewport | `ReloadButton`; `OfflineBanner` covers the in-app case |

## Auth (`(auth)/*`, public, centered card, mobile-first)

| Route | Purpose | States |
|---|---|---|
| `/login` | Sign in (credentials + Google) | idle / validating / invalid credentials / rate-limited / network error |
| `/signup` | Create account | validation / duplicate email / signups-closed / referral capture / auto sign-in |
| `/forgot` | Request password reset | success (no enumeration) / dev-token fallback when email unconfigured |
| `/reset` | Set new password from token | invalid-or-expired link / success |
| `/verify` | Email verification from token | success / invalid-or-expired / resend |

## Onboarding

| Route | Purpose | Auth |
|---|---|---|
| `/onboarding` | First-run: welcome → connect accounts → profile → workspace → first post → done; skip / resume supported | user |

## App — core (`(app)/*`, member; tailored `loading.tsx` noted)

| Route | Purpose | Skeleton |
|---|---|---|
| `/dashboard` | Activity overview, KPIs | group `dashboard` |
| `/composer`, `/composer/new`, `/composer/[id]` | Post editor — AI toolbar, media, per-platform validation, char limits, recurring; `useUnsavedChanges` armed while dirty | `grid` / `split` |
| `/calendar` | Drag-to-reschedule calendar; bulk delete via `ConfirmDialog`; timezone-aware | tailored |
| `/queue` | Slot-based publishing queue | `list` |
| `/media` | Asset library — upload, filter, bulk select/delete | `grid` |
| `/analytics`, `/analytics/{content,audience,report}` | Metrics, heatmaps, exports | tailored + generic |
| `/campaigns`, `/campaigns/[id]` | Campaign planning, results | `table` |
| `/team` | Members, roles, invitations | `list` |
| `/approvals`, `/comments`, `/inbox` | Review + engagement | `list` / tailored |
| `/automations`, `/recycling`, `/templates`, `/ideas`, `/trends`, `/insights`, `/competitors`, `/reports`, `/opportunities`, `/referrals`, `/integrations`, `/studio`, `/agency` | Feature areas; entitlement-gated in nav | `list` / `grid` / `dashboard` |

## App — settings (`(app)/settings/*`, member; `form`/`table`/`list` skeletons)

`profile` · `security` · `devices` · `notifications` · `brand` · `workspace` (+ `/new`) ·
`api` · `billing` (+ `/confirm`). Each: idle → dirty (`useUnsavedChanges`) → saving → success/error toast.

## Admin (`admin/*`, admin only)

`/admin` dashboard · `orgs` · `users` · `plans` · `billing` · `usage` · `referrals` ·
`support` · `content` (CMS) · `flags` · `settings` · `system` (live health) · `audit` ·
`posts` (moderation) · `connections` · `broadcast`. Destructive actions route through
`confirmDestructive()`.

## Marketing (`(marketing)/*`, public, mostly static/SSG)

Landing, `pricing`, `about`, `contact`, `security`, `changelog`, `roadmap`, `community`,
`press`, `webinars`, `help`, `status` (live), `blog/*`, `careers/*`, `customers/*`,
`features/*`, `guides/*`, `solutions/*`, `resources/templates`, `tools/*`, `legal/*`.

## Shared state components

`EmptyState` · `ErrorState` · `SuccessState` · `PermissionDenied` · `FormError` ·
`Skeleton` / `PageSkeleton` · `Spinner` · `Progress` · `RetryButton` · `ReloadButton` ·
`ConfirmDialog` / `ConfirmProvider` / `useConfirm` / `confirmDestructive` ·
`OfflineBanner` / `useOnline` · `useUnsavedChanges` · `PageHeader` · `SystemPage`.
