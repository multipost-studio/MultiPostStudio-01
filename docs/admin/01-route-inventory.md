# Admin route inventory

_Generated 2026-10-09 by static analysis of `src/app/admin/**`, `src/lib/nav.ts` and `src/app/actions/**`. Re-generate rather than editing by hand._

Every `/admin/*` request passes the edge proxy (the legacy support tier is confined to `/admin/support`) and `src/app/admin/layout.tsx` (`requireAdminAccess`: staff holding at least one permission). Each page and action then checks its own permission with `requireAdminPermission(key)`; `requirePlatformAdmin()` is reserved for roles and admin accounts. See [04-permission-matrix.md](04-permission-matrix.md).

Pages: **51** · Admin server actions: **132** · Export/search API routes: `/api/admin/export`, `/api/admin/health/export`, `/api/admin/audience-export`, `/api/admin/search`, `/admin/api/notify-count`.

| Route | Sidebar group / item | Guard | Tables read directly | Action modules used |
|---|---|---|---|---|
| `/admin` | Overview / Overview | permission: overview.view | via lib (admin-analytics, chart-colors) | admin, impersonation |
| `/admin/access` | Operations / Access & Roles | permission: access.view | adminCustomRole, user, adminRoleAssignment | admin-access |
| `/admin/affiliates` | People & orgs / Affiliates | permission: affiliates.view | affiliate, affiliateCommission, affiliatePayout | affiliates |
| `/admin/ai` | Social & AI / AI Providers | permission: ai.view | aiProviderCredential | none (read-only) |
| `/admin/audit` | Operations / Audit Log | permission: audit.view | auditLog | none (read-only) |
| `/admin/automations` | Operations / Automations | permission: system.view | systemSetting, automation, automationRun | none (read-only) |
| `/admin/billing` | Revenue / Billing | permission: billing.view | invoice, subscription, coupon | none (read-only) |
| `/admin/blog` | Content / Blog | permission: content.view | blogCategory, blogAuthor | blog |
| `/admin/blog/[id]` | Content / Blog | permission: content.view | blogPost, blogCategory, blogAuthor, blogTag | none (read-only) |
| `/admin/blog/analytics` | Content / Blog | permission: content.view | blogPost, blogCategory | none (read-only) |
| `/admin/blog/authors` | Content / Authors | permission: content.view | blogAuthor | blog |
| `/admin/blog/calendar` | Content / Blog | permission: content.view | blogPost | none (read-only) |
| `/admin/blog/categories` | Content / Categories | permission: content.view | blogCategory | blog |
| `/admin/blog/comments` | Content / Comments | permission: content.view | blogComment | blog |
| `/admin/blog/import` | Content / Blog | permission: content.view | via lib (blog-launch) | blog, blog-launch |
| `/admin/blog/media` | Content / Media | permission: content.view | mediaAsset | blog |
| `/admin/blog/new` | Content / Blog | permission: content.view | blogCategory, blogAuthor, blogTag | none (read-only) |
| `/admin/blog/settings` | Content / Blog Settings | permission: content.view | blogSetting, blogAuthor | blog |
| `/admin/blog/tags` | Content / Tags | permission: content.view | blogTag | blog |
| `/admin/branding` | Marketing / Site Branding | permission: marketing.view | via lib (admin-query) | admin-branding |
| `/admin/broadcast` | Marketing / Broadcast | permission: broadcast.send | user, notification | none (read-only) |
| `/admin/connections` | Platform / Connections | permission: integrations.view | socialAccount, apiKey, webhook | none (read-only) |
| `/admin/content` | Social & AI / Content (CMS) | permission: content.view | cmsEntry | none (read-only) |
| `/admin/design-system` | Platform / Design System | permission: settings.view | via lib (chart-colors) | none (read-only) |
| `/admin/festivals` | Marketing / Festival Themes | permission: marketing.view | auditLog | admin-festivals |
| `/admin/flags` | Platform / Feature Flags | permission: flags.view | featureFlag | admin-flags |
| `/admin/footer` | Marketing / Footer & Links | permission: marketing.view | via lib (cms, env, site-index) | admin-footer |
| `/admin/health` | Operations / Health Probes | permission: system.view | via lib (admin-query) | admin-health |
| `/admin/marketing` | Marketing / Acquisition | permission: marketing.view | via lib (marketing-analytics, attribution, marketing-report) | none (read-only) |
| `/admin/marketing/audiences` | Marketing / Audiences | permission: marketing.view | marketingSegment, plan | marketing-admin |
| `/admin/marketing/links` | Marketing / UTM Links | permission: marketing.view | via lib (env, marketing-analytics) | none (read-only) |
| `/admin/notifications` | Platform / Notifications | permission: notifications.view | via lib (admin-notifications, admin-signals) | admin-notifications |
| `/admin/observability` | Operations / Observability | permission: system.view | systemEvent | admin-observability |
| `/admin/orgs` | People & orgs / Organizations | permission: orgs.view | organization, plan, subscription | none (read-only) |
| `/admin/orgs/[id]` | People & orgs / Organizations | permission: orgs.view | organization, post, auditLog, supportTicket | admin |
| `/admin/plans` | Revenue / Plans | permission: billing.view | plan | admin |
| `/admin/platform-rules` | Platform / Platform Rules | permission: settings.view | platformRule, platformRuleRevision, user | platform-rules |
| `/admin/posts` | Social & AI / Posts | permission: posts.view | post | admin |
| `/admin/privacy-requests` | Operations / Privacy Requests | permission: privacy.view | privacyRequest | privacy |
| `/admin/promo-cards` | Marketing / Promo Cards | permission: marketing.view | promoCard, plan | promo-cards |
| `/admin/queue` | Operations / Queue Engine | permission: queue.view | publishJob | admin |
| `/admin/revenue` | Revenue / Revenue | permission: billing.view | via lib (revenue, revenue-db) | revenue |
| `/admin/reviews` | Marketing / Reviews | permission: marketing.view | via lib (logger, admin-query) | admin-reviews |
| `/admin/security` | Operations / Security & Lockouts | permission: security.view | user, device, auditLog | admin |
| `/admin/settings` | Platform / Site Settings | permission: settings.view | via lib (settings) | none (read-only) |
| `/admin/support` | Operations / Support | permission: support.view | supportTicket, user | support |
| `/admin/support/[id]` | Operations / Support | permission: support.view | supportTicket, user | none (read-only) |
| `/admin/system` | Operations / System Health | permission: system.view | systemEvent, publishJob, webhookDelivery | none (read-only) |
| `/admin/usage` | Platform / Usage & API | permission: usage.view | usageRecord, apiKey, webhookDelivery, publishJob | none (read-only) |
| `/admin/users` | People & orgs / Users | permission: users.view | user | admin |
| `/admin/users/[id]` | People & orgs / Users | permission: users.view | user, auditLog | admin, impersonation |

Status legend and verification state for each page are in [00-progress.md](00-progress.md). "Implemented" here means the route, its data source and its guard exist in code; it does **not** mean it was independently exercised in a browser.
