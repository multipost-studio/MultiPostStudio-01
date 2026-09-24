# MultiPost Studio — Sitemap & Route Index

This document provides the authoritative index of all routes across the MultiPost Studio production codebase, detailing their purpose, audience, and search engine indexability (`INDEXABLE` vs `NOINDEX / PRIVATE`).

Production Base URL: `https://www.multipoststudio.online`
Sitemap XML Endpoint: `/sitemap.xml` (generated dynamically by `src/app/sitemap.ts`)
Robots Exclusion Endpoint: `/robots.txt` (configured in `src/app/robots.ts`)

---

## 1. Public Marketing & Legal Pages (Indexable in `sitemap.xml`)

| Route | Purpose | Indexable | Priority | Change Frequency |
| :--- | :--- | :---: | :---: | :---: |
| `/` | MultiPost Studio Homepage & Platform Overview | **INDEXABLE** | `1.0` | Daily |
| `/pricing` | Dynamic Plan Catalog (USD & INR tiers, feature comparison) | **INDEXABLE** | `0.9` | Daily |
| `/features` | Core Capabilities Catalog | **INDEXABLE** | `0.9` | Weekly |
| `/features/publishing` | Multi-Channel Composer & Smart Queue Deep-Dive | **INDEXABLE** | `0.8` | Weekly |
| `/features/analytics` | Performance Metrics, Reports & Health Score | **INDEXABLE** | `0.8` | Weekly |
| `/features/engagement` | Unified Social Inbox, AI Triage & Direct Replies | **INDEXABLE** | `0.8` | Weekly |
| `/features/ai-studio` | AI Content Studio, Repurposing & Brand Brain | **INDEXABLE** | `0.8` | Weekly |
| `/features/recycling` | Evergreen Content Rotation & Queue Refill Engine | **INDEXABLE** | `0.8` | Weekly |
| `/solutions` | Solutions Directory by Team Size and Industry | **INDEXABLE** | `0.8` | Weekly |
| `/solutions/creators` | Creator Workflow: Batching, Queue Drip & Recycling | **INDEXABLE** | `0.8` | Weekly |
| `/solutions/small-business` | Small Business: Scheduled Presence & Unified Inbox | **INDEXABLE** | `0.8` | Weekly |
| `/solutions/agencies` | Agency Operations: Client Workspaces & Review Portals | **INDEXABLE** | `0.8` | Weekly |
| `/solutions/marketing-teams`| Team Collaboration: Multi-Tier Approvals & RBAC | **INDEXABLE** | `0.8` | Weekly |
| `/solutions/startups` | Startup Operations: Lean Content Machine | **INDEXABLE** | `0.8` | Weekly |
| `/solutions/enterprise` | Enterprise Governance: Audit Logs, SSO & Security | **INDEXABLE** | `0.8` | Weekly |
| `/blog` | Social Strategy & Product Engineering Articles | **INDEXABLE** | `0.8` | Daily |
| `/blog/consistency-beats-virality` | Editorial Playbook: Compounding Publishing Cadence | **INDEXABLE** | `0.7` | Monthly |
| `/blog/brand-voice-that-survives-ai` | Editorial Playbook: Calibrating AI with Brand Brain | **INDEXABLE** | `0.7` | Monthly |
| `/blog/approvals-without-the-bottleneck` | Editorial Playbook: Frictionless Sign-Off Chains | **INDEXABLE** | `0.7` | Monthly |
| `/blog/what-your-analytics-should-tell-you` | Editorial Playbook: Actionable Social Insights | **INDEXABLE** | `0.7` | Monthly |
| `/guides` | Practical Social Media Strategy Guides | **INDEXABLE** | `0.7` | Weekly |
| `/guides/content-pillars` | Step-by-Step Guide: Establishing Sustainable Pillars | **INDEXABLE** | `0.7` | Monthly |
| `/guides/posting-schedule` | Step-by-Step Guide: Data-Driven Publishing Schedules | **INDEXABLE** | `0.7` | Monthly |
| `/guides/agency-onboarding` | Step-by-Step Guide: Setting Up Client Workspaces in 1 Day | **INDEXABLE** | `0.7` | Monthly |
| `/guides/repurposing` | Step-by-Step Guide: 1 Concept into 9 Network Posts | **INDEXABLE** | `0.7` | Monthly |
| `/customers` | Verified Workflow Playbooks & Case Studies | **INDEXABLE** | `0.7` | Weekly |
| `/customers/agency-workflow` | Workflow Study: Multi-Client Agency Governance | **INDEXABLE** | `0.7` | Monthly |
| `/customers/content-creator` | Workflow Study: Solo Creator 9-Platform Production | **INDEXABLE** | `0.7` | Monthly |
| `/customers/growth-teams` | Workflow Study: Fast-Paced Marketing Brand Voice | **INDEXABLE** | `0.7` | Monthly |
| `/careers` | Career Opportunities & Engineering Culture | **INDEXABLE** | `0.6` | Weekly |
| `/careers/senior-product-engineer` | Job Posting: Senior Full-Stack Product Engineer | **INDEXABLE** | `0.6` | Monthly |
| `/careers/design-engineer` | Job Posting: Design Systems Engineer | **INDEXABLE** | `0.6` | Monthly |
| `/careers/ml-engineer-generation` | Job Posting: Machine Learning Engineer (Generation) | **INDEXABLE** | `0.6` | Monthly |
| `/careers/customer-success-lead` | Job Posting: Customer Operations & Success Lead | **INDEXABLE** | `0.6` | Monthly |
| `/careers/content-marketer` | Job Posting: Content Strategist & Writer | **INDEXABLE** | `0.6` | Monthly |
| `/tools` | Free Marketing Utility Suite | **INDEXABLE** | `0.8` | Weekly |
| `/tools/best-time` | Interactive Best Time to Post Calculator | **INDEXABLE** | `0.7` | Weekly |
| `/tools/caption-generator` | Interactive Social Caption Generator | **INDEXABLE** | `0.7` | Weekly |
| `/tools/character-counter` | Interactive Live Social Limit Character Counter | **INDEXABLE** | `0.7` | Weekly |
| `/tools/engagement-rate` | Interactive Engagement Rate Calculator | **INDEXABLE** | `0.7` | Weekly |
| `/tools/hashtag-generator` | Interactive Niche Hashtag Generator | **INDEXABLE** | `0.7` | Weekly |
| `/community` | MultiPost Studio Community Directory & Events | **INDEXABLE** | `0.6` | Monthly |
| `/webinars` | Product Demos & Deep-Dive Video Library | **INDEXABLE** | `0.6` | Monthly |
| `/press` | Official Media Kit & Brand Logo Downloads | **INDEXABLE** | `0.5` | Monthly |
| `/resources/templates` | Ready-to-Use Social Post & Campaign Templates | **INDEXABLE** | `0.7` | Weekly |
| `/changelog` | Chronological Release Notes & Updates | **INDEXABLE** | `0.7` | Weekly |
| `/about` | Mission, Engineering Principles & Team | **INDEXABLE** | `0.6` | Monthly |
| `/contact` | Sales Inquiries & Direct Support Contact | **INDEXABLE** | `0.6` | Monthly |
| `/help` | Customer Knowledge Base & Frequently Asked Questions | **INDEXABLE** | `0.6` | Monthly |
| `/roadmap` | Public Development Roadmap (Now / Next / Later) | **INDEXABLE** | `0.6` | Weekly |
| `/security` | Data Encryption, Isolation & Compliance Details | **INDEXABLE** | `0.7` | Monthly |
| `/status` | Real-Time Platform Uptime & Service Diagnostics | **INDEXABLE** | `0.5` | Daily |
| `/legal/privacy` | MultiPost Studio Privacy Policy (GDPR / CCPA) | **INDEXABLE** | `0.3` | Monthly |
| `/legal/terms` | Terms of Service & Master Subscription Agreement | **INDEXABLE** | `0.3` | Monthly |
| `/legal/cookies` | Cookie Usage & Consent Policy | **INDEXABLE** | `0.3` | Monthly |
| `/legal/dpa` | Data Processing Addendum | **INDEXABLE** | `0.3` | Monthly |
| `/legal/data-deletion` | Platform OAuth Data Deletion Instructions | **INDEXABLE** | `0.3` | Monthly |

---

## 2. Authentication Pages (Public but Disallowed / Noindex)

| Route | Purpose | Indexable |
| :--- | :--- | :---: |
| `/login` | User authentication via credentials or demo session | `NOINDEX / DISALLOWED` |
| `/signup` | User account registration | `NOINDEX / DISALLOWED` |
| `/forgot` | Password recovery request form | `NOINDEX / DISALLOWED` |
| `/reset` | Password reset token execution | `NOINDEX / DISALLOWED` |
| `/verify` | Email verification confirmation screen | `NOINDEX / DISALLOWED` |

---

## 3. Authenticated Workspace Pages (Strictly Private)

| Route | Purpose | Indexable |
| :--- | :--- | :---: |
| `/dashboard` | Workspace command center (KPIs, active queue, channels) | `NOINDEX / PRIVATE` |
| `/composer`, `/composer/new` | Multi-network social content editor with live previews | `NOINDEX / PRIVATE` |
| `/composer/[id]` | Edit existing post draft or scheduled update | `NOINDEX / PRIVATE` |
| `/composer/grid` | Visual 3×3 Instagram profile feed planner | `NOINDEX / PRIVATE` |
| `/calendar` | Interactive drag-and-drop editorial calendar | `NOINDEX / PRIVATE` |
| `/queue` | Per-channel automated publishing slot manager | `NOINDEX / PRIVATE` |
| `/recycling` | Evergreen content recycling pool and frequency rules | `NOINDEX / PRIVATE` |
| `/campaigns`, `/campaigns/[id]` | Marketing campaign manager with tied posts | `NOINDEX / PRIVATE` |
| `/approvals` | Multi-stage review queue (Creator → Editor → Manager) | `NOINDEX / PRIVATE` |
| `/inbox` | Unified multi-channel social inbox & AI reply triage | `NOINDEX / PRIVATE` |
| `/comments` | Direct post comment feed and moderation stream | `NOINDEX / PRIVATE` |
| `/media` | Asset repository with folders, tagging, and upload limits | `NOINDEX / PRIVATE` |
| `/studio` | AI Content Studio: Hook generation, rewriting & Brand Brain | `NOINDEX / PRIVATE` |
| `/ideas` | 7-stage Kanban ideation board | `NOINDEX / PRIVATE` |
| `/trends` | Topic discovery and suggested trending themes | `NOINDEX / PRIVATE` |
| `/opportunities` | Cadence gap analysis and recommended posting slots | `NOINDEX / PRIVATE` |
| `/competitors` | Public competitor benchmarking intelligence | `NOINDEX / PRIVATE` |
| `/templates` | Reusable custom and system post templates | `NOINDEX / PRIVATE` |
| `/automations` | Event-driven trigger-condition-action rule builder | `NOINDEX / PRIVATE` |
| `/integrations` | OAuth connection center for 9 social networks | `NOINDEX / PRIVATE` |
| `/analytics` | Workspace cross-network performance dashboard | `NOINDEX / PRIVATE` |
| `/analytics/content` | Post-level engagement, formats and impressions | `NOINDEX / PRIVATE` |
| `/analytics/audience` | Follower growth velocity and audience metrics | `NOINDEX / PRIVATE` |
| `/analytics/report` | Custom white-label PDF/CSV report exports | `NOINDEX / PRIVATE` |
| `/insights`, `/insights/streak` | Publishing streak and habit consistency tracking | `NOINDEX / PRIVATE` |
| `/reports`, `/reports/builder` | Visual drag-and-drop report layout builder | `NOINDEX / PRIVATE` |
| `/agency`, `/agency/clients/[id]` | Multi-client agency management and portal generator | `NOINDEX / PRIVATE` |
| `/referrals` | Customer referral links and reward tracking | `NOINDEX / PRIVATE` |
| `/team` | Organization & workspace RBAC member management | `NOINDEX / PRIVATE` |
| `/settings/profile` | User avatar, name and preferences | `NOINDEX / PRIVATE` |
| `/settings/security` | Two-factor authentication (2FA) and password updates | `NOINDEX / PRIVATE` |
| `/settings/devices` | Active login sessions and remote revocation | `NOINDEX / PRIVATE` |
| `/settings/notifications` | Granular email and push alert preferences | `NOINDEX / PRIVATE` |
| `/settings/workspace` | Workspace name, default timezone, and channel presets | `NOINDEX / PRIVATE` |
| `/settings/workspace/new` | Multi-workspace provisioning flow | `NOINDEX / PRIVATE` |
| `/settings/brand` | Brand Kit: Hex colors, logos, fonts | `NOINDEX / PRIVATE` |
| `/settings/brand/voice` | Brand Brain AI voice training material & tone rules | `NOINDEX / PRIVATE` |
| `/settings/billing` | Stripe/Razorpay billing portal, invoices, and plans | `NOINDEX / PRIVATE` |
| `/settings/billing/checkout` | Subscription checkout redirect | `NOINDEX / PRIVATE` |
| `/settings/billing/confirm` | Payment confirmation & sync handler | `NOINDEX / PRIVATE` |
| `/settings/api` | Personal access tokens and API documentation | `NOINDEX / PRIVATE` |
| `/settings/webhooks` | Outbound event webhooks and delivery logs | `NOINDEX / PRIVATE` |
| `/settings/support`, `/[id]` | Customer support ticket submission and thread history | `NOINDEX / PRIVATE` |
| `/onboarding` | 4-step new workspace setup wizard | `NOINDEX / PRIVATE` |
| `/switch` | Organization and workspace fast-switcher | `NOINDEX / PRIVATE` |

---

## 4. Admin Management Pages (Super-Admin Role Required)

| Route | Purpose | Indexable |
| :--- | :--- | :---: |
| `/admin` | Executive platform telemetry & KPI dashboard | `NOINDEX / PRIVATE` |
| `/admin/audit` | Platform-wide tamper-evident security audit trail | `NOINDEX / PRIVATE` |
| `/admin/billing` | SaaS financial metrics (MRR, ARR, churn, collections) | `NOINDEX / PRIVATE` |
| `/admin/broadcast` | Global banner notifications and in-app alerts | `NOINDEX / PRIVATE` |
| `/admin/connections` | Health monitoring for OAuth platform tokens | `NOINDEX / PRIVATE` |
| `/admin/content` | Marketing CMS database entry editor & seed syncer | `NOINDEX / PRIVATE` |
| `/admin/flags` | Dynamic system feature flag configuration | `NOINDEX / PRIVATE` |
| `/admin/health` | Infrastructure pings (Redis, PostgreSQL, external APIs) | `NOINDEX / PRIVATE` |
| `/admin/notifications` | Broadcast delivery history and status | `NOINDEX / PRIVATE` |
| `/admin/observability` | OpenTelemetry spans, latency curves, and error logs | `NOINDEX / PRIVATE` |
| `/admin/orgs`, `/[id]` | Tenant management, workspace quotas, plan overrides | `NOINDEX / PRIVATE` |
| `/admin/plans` | Authoritative pricing tier editor (USD & INR prices) | `NOINDEX / PRIVATE` |
| `/admin/posts` | Global post publishing status stream and failure logs | `NOINDEX / PRIVATE` |
| `/admin/queue` | BullMQ background job queues, delays, and dead-letters | `NOINDEX / PRIVATE` |
| `/admin/referrals` | Affiliate commission ledger and reward payouts | `NOINDEX / PRIVATE` |
| `/admin/security` | IP rate limit violations and suspicious activity | `NOINDEX / PRIVATE` |
| `/admin/settings` | Global platform environment variables and SMTP | `NOINDEX / PRIVATE` |
| `/admin/support`, `/[id]` | Centralized support ticket resolution desk | `NOINDEX / PRIVATE` |
| `/admin/system` | Runtime specs (Node version, Prisma pool, memory usage) | `NOINDEX / PRIVATE` |
| `/admin/usage` | AI token consumption, API calls, and storage metrics | `NOINDEX / PRIVATE` |
| `/admin/users`, `/[id]` | User directory, authentication provider, impersonation | `NOINDEX / PRIVATE` |

---

## 5. Client Review Portals & Shared Reports (Token-Gated)

| Route | Purpose | Indexable |
| :--- | :--- | :---: |
| `/portal/[token]` | External guest client post review & approval portal | `NOINDEX / PRIVATE` |
| `/portal/[token]/calendar` | Guest client filtered scheduled calendar | `NOINDEX / PRIVATE` |
| `/portal/[token]/reports` | Guest client white-label summary report view | `NOINDEX / PRIVATE` |
| `/share/report/[token]` | Public read-only live analytics snapshot | `NOINDEX / PRIVATE` |

---

## 6. System & Error Boundary Pages

| Route | Purpose | Indexable |
| :--- | :--- | :---: |
| `/401` | Unauthorized access screen | `NOINDEX / SYSTEM` |
| `/403` | Forbidden / insufficient permissions screen | `NOINDEX / SYSTEM` |
| `/500` | Internal server error fallback | `NOINDEX / SYSTEM` |
| `/502` | Bad gateway fallback | `NOINDEX / SYSTEM` |
| `/503` | Service temporarily unavailable screen | `NOINDEX / SYSTEM` |
| `/maintenance` | Scheduled maintenance window notice | `NOINDEX / SYSTEM` |
| `/offline` | PWA offline connectivity fallback | `NOINDEX / SYSTEM` |
| `not-found.tsx` | Next.js App Router 404 handler | `NOINDEX / SYSTEM` |

---

## 7. API Endpoints (All Disallowed in `robots.txt`)

All paths prefixed with `/api/` are internal or programmatic endpoints and are strictly excluded from indexing:
- `/api/auth/*` (NextAuth / session handlers)
- `/api/billing/*` (Stripe & Razorpay checkout, portal, webhooks)
- `/api/composer/*` (Post drafting, scheduling, publishing dispatch)
- `/api/integrations/*` (OAuth connect & callback for all 9 networks)
- `/api/admin/*` (Super-admin management actions)
- `/api/inbox/*` (Message triage and replies)
- `/api/webhooks/*` (Inbound social platform webhooks)
