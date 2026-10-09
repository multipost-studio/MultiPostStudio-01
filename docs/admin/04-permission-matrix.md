# Admin permission matrix

_Last reviewed 2026-10-09. Describes what the code **enforces**. The registry lives in `src/lib/admin-permissions.ts`; this page explains it, it does not replace it._

## 1. The model

Every admin page, server action and export route checks a named **permission** (`users.view`, `billing.manage`, `data.export`, …). A staff member's permissions come from their tier plus any role assignments:

| Tier (`User.platformRole`) | `isPlatformAdmin` | Permissions |
|---|---|---|
| `null` — **full administrator** (every pre-existing admin) | true | All of them, including the two super-only keys. Nobody's access changed when roles arrived |
| `"support"` — legacy support tier | true | The built-in **Support** role. Also confined to `/admin/support` by the edge proxy |
| `"scoped"` — role-based staff | true | Only the union of their **active** role assignments (built-in or custom) |
| customer | false | None |

Roles:

- **Built-in** (defined in code, cannot be edited or deleted): Support, Finance, Security, Operations, Content, Marketing, Read-only operator.
- **Custom**: created on `/admin/access`, stored in `AdminCustomRole` as a JSON list of permission keys validated against the registry.
- **Assignments** (`AdminRoleAssignment`): user, role key, who granted it, a required written reason, optional expiry (1–365 days), revoked-at/by. Rows are never deleted, only revoked, so history survives. An expired or revoked assignment grants nothing, and the check happens on every request (no long-lived cache).

Hard rules, enforced in code and tests:

1. `access.view` and `access.manage` are **super-only**. They cannot be put in any role (the resolver drops them even if the database row contains them), so no role can ever grant the ability to manage access.
2. Only a full administrator can open `/admin/access`, call its actions, or change an account's `isPlatformAdmin`/`platformRole` (`setUserAdminAction`, `setUserPlatformRoleAction`); all use `requirePlatformAdmin()`. Customer impersonation is refused to every non-full account.
3. A role can only contain permissions the actor holds (`grantable`). An actor cannot change their own access, and full administrators cannot be given roles.
4. Every role create/update/delete and every assignment/revocation requires a reason, writes an audit event (`admin.role_*`), and assignment notifies the person.
5. Giving a role to an ordinary account makes it `scoped` staff; revoking their last role returns it to an ordinary account. A legacy support admin who receives another role moves to `scoped` with their Support role carried across as an explicit assignment.

## 2. Guards (`src/lib/session.ts`)

| Guard | Used for |
|---|---|
| `requireAdminAccess()` | `admin/layout.tsx`: any staff member holding at least one permission; the sidebar shows only items whose route permission they hold |
| `requireAdminPermission(key)` | every admin page and every admin server action. A staff member without the key is redirected to the first admin page they can use, or the app |
| `hasAdminPermission(key)` | route handlers that answer with a status code (exports) |
| `getStaffPermissions()` | search scope, nav filtering, grant checks |
| `requirePlatformAdmin()` | super-only work: roles and access, admin accounts |

Defence in depth: the edge proxy still bounces the legacy support tier to `/admin/support`, but it only sees page navigations. A server action is a direct POST, so the real enforcement is in the page and the action.

## 3. What each surface needs

| Surface | Read | Write |
|---|---|---|
| Overview | `overview.view` | – |
| Users / organizations / affiliates | `users.view` / `orgs.view` / `affiliates.view` | `users.manage` / `orgs.manage` / `affiliates.manage` |
| Revenue, plans, billing | `billing.view` | `billing.manage`, `plans.manage` |
| Marketing, branding, reviews, promo cards, festivals, footer | `marketing.view` | `marketing.manage`; broadcast needs `broadcast.send` |
| Blog and CMS | `content.view` | `content.manage` |
| Posts, queue, connections, AI | `posts.view`, `queue.view`, `integrations.view`, `ai.view` | `posts.manage`, `queue.manage`, `integrations.manage` |
| Flags, settings, platform rules | `flags.view`, `settings.view` | `flags.manage`, `settings.manage` |
| Support desk | `support.view` | `support.manage` |
| Privacy requests | `privacy.view` | `privacy.manage` |
| Security and lockouts | `security.view` | `security.manage` |
| System health, probes, observability | `system.view` | `system.manage` |
| Audit log | `audit.view` | none (no write path exists) |
| Data exports | `data.export` **and** the view permission of the dataset (`DATASET_VIEW_PERMISSION`, fails closed for unmapped datasets) | – |
| Global search | each result type needs its own view permission; invoices need `billing.view` and `orgs.view` | – |
| Access & roles | `access.view` (super-only) | `access.manage` (super-only) |

## 4. Automated coverage

- `src/lib/admin-permissions.test.ts` — registry integrity, resolver (tiers, expiry, revocation, custom roles, super-only filtering), `grantable`, route mapping.
- `src/lib/platform-admin-guard.test.ts` — the session guards per tier, including role-based staff and deleted custom roles.
- `src/app/admin/admin-guards.test.ts` — static: every admin page and action module has a guard; each page asks for a real permission and the one its route is mapped to; the super-admin guard is used only in three places; every export route checks a permission and `data.export`.
- `src/app/actions/admin-access.test.ts` — create/update/delete roles, assign/revoke, validation, self/full-admin refusal, promotion/demotion, legacy support carry-over.
- `src/lib/admin-search.test.ts`, `src/app/api/admin/search/route.test.ts`, `src/app/api/admin/audience-export/route.test.ts` — permission-scoped search and export.

Not covered by an automated test: a live end-to-end session for each role (needs the CI database and seeded users).

## 5. Not built

- Organisation- or resource-scoped admin access (a role is global).
- Two-person approval, step-up MFA / recent authentication, and access reviews. Reasons are captured for access changes, **not** yet for every sensitive action such as invoice overrides or credits.
- The database migration `20261009160000_admin_access_control` must be applied (`npx prisma migrate deploy`) **before** this code is deployed: the guards read `AdminRoleAssignment` for any non-full staff account. Full administrators never touch the new tables, so they are unaffected either way, but the legacy support tier would hit the missing table.
