# DPDP Personal Data Inventory

Engineering compliance document — not legal advice. Built from a read-only codebase audit (September 2026) against `prisma/schema.prisma` and the code paths that create/read/export each field. File:line citations refer to the working tree at audit time; re-verify against current code before relying on specifics.

Status legend for the Deletion column: `HARD` = row is actually removed, `SOFT` = flag set, record kept, `NONE` = no deletion path exists, `RETAIN` = intentionally kept (financial/legal record).

## Account & authentication

| Data | Data Subject | Source | Purpose | Storage | Processor / Third Party | Retention | Deletion |
|---|---|---|---|---|---|---|---|
| Name, email, password hash | User (any platform user) | Signup form (`src/app/actions/auth.ts`) | Account identity, login | `User` table, Postgres | None (self-hosted DB) | Indefinite | **SOFT** — `deleteUserAction` sets `deletedAt`/`suspendedAt` only; row and all fields persist |
| Password hash | User | Signup/reset | Authentication | `User.passwordHash`, bcrypt | — | Indefinite | SOFT (see above) |
| 2FA secret | User (opted in) | 2FA enrollment | MFA | `User.twoFactorSecret`, AES-256-GCM sealed | — | Indefinite | SOFT |
| Google OAuth login token | User (Google sign-in only) | Google sign-in flow | Login | `Account.refresh_token/access_token`, **plaintext** | Google (as identity provider) | Indefinite | SOFT — orphaned on user soft-delete |
| Session tokens | User | Every login | Session management | `Session` table | — | Until expiry (short-lived) | HARD on logout/expiry (standard NextAuth behavior) |
| IP address, user agent | User | Every device/session touch | Security/device history | `Device.ip/userAgent`, plaintext | — | Indefinite, no TTL | NONE |
| Verification/reset tokens | User | Email verify, password reset | One-time auth actions | `VerificationToken`, plaintext token | — | Short-lived | HARD — janitor.ts purges expired rows |

## Organization & billing

| Data | Data Subject | Source | Purpose | Storage | Processor / Third Party | Retention | Deletion |
|---|---|---|---|---|---|---|---|
| Billing name/email/address, tax ID | Org billing contact | Checkout/settings | Invoicing, tax compliance | `Organization.billing*`, plaintext | Stripe or Razorpay (whichever configured) | Indefinite | SOFT — org `deletedAt` set, fields persist |
| Subscription/invoice records | Org | Billing webhooks | Revenue records, legal/accounting requirement | `Subscription`, `Invoice`, `UsageRecord` | Stripe/Razorpay (customer/sub IDs only, no card data) | Indefinite | **RETAIN** — financial recordkeeping; not tied to any deletion flow |
| Team member invite email | Invitee | Team invite flow | Onboarding | `Membership.invitedEmail`, plaintext | — | Indefinite | NONE |

## Social platform connections (the core product function)

| Data | Data Subject | Source | Purpose | Storage | Processor / Third Party | Retention | Deletion |
|---|---|---|---|---|---|---|---|
| OAuth access/refresh tokens | User (workspace member) | Platform OAuth connect flow | Publish/read on connected social accounts | `SocialAccount.accessToken/refreshToken`, **AES-256-GCM encrypted** | Facebook, Instagram, LinkedIn, X, TikTok, Pinterest, YouTube, Threads (whichever connected) | Until disconnected | Reported **HARD** on disconnect per product copy (`legal/data-deletion/page.tsx`) — not independently re-verified this pass |
| Connected-account profile (handle, display name, avatar) | User | Same | Display in UI | `SocialAccount`, plaintext | Same platforms | Until disconnected | Same as above |
| Drive/Photos/Dropbox/OneDrive/Canva tokens | User | Integration connect flow | Media import | `ConnectedIntegration`, AES-256-GCM encrypted | Google, Dropbox, Microsoft, Canva | Until disconnected | Same pattern |
| AI provider API keys (BYOK) | User/workspace | AI Providers settings | Customer's own AI usage, never MultiPost's cost | `AiProviderCredential.encryptedApiKey`, AES-256-GCM encrypted; only `keyLast4` ever displayed | The customer's chosen AI provider (Anthropic, OpenAI, etc.) — MultiPost's server only forwards, never retains prompt/response | Until removed | HARD — `disconnectAiCredential` does a real `deleteMany` |

## Content & engagement

| Data | Data Subject | Source | Purpose | Storage | Processor / Third Party | Retention | Deletion |
|---|---|---|---|---|---|---|---|
| Post drafts/published content, media | Workspace | Composer/Studio | Core product function | `Post`, `PostVersion`, `MediaAsset` | S3-compatible storage (provider depends on deployment config) | Indefinite | NONE — orphaned on org soft-delete, not purged |
| Inbound comments/DMs from social platforms | Third-party social users (not MultiPost's own users) | Social API pull (Inbox feature) | Let workspace respond to their own audience | `Conversation`, `Message` | Source social platform | Indefinite | NONE |
| Internal collaboration comments | Workspace member | Comment feature | Team collaboration | `ThreadComment` | — | Indefinite | NONE |
| Mini-CRM contact profiles (handle, notes, tags) | Third-party social users the workspace interacts with | Manual entry / inbox | Workspace's own audience management | `SocialContact` | — | Indefinite | NONE |

## Analytics

| Data | Data Subject | Source | Purpose | Storage | Processor / Third Party | Retention | Deletion |
|---|---|---|---|---|---|---|---|
| Post/account performance metrics | Workspace (aggregate, not individually identifying beyond the connected account) | Social platform APIs | Analytics dashboards | `MetricSnapshot`, `PostMetric` | Source social platforms | `Plan.analyticsRetentionDays` (30–1825 days) is a **query-time cap only** — underlying rows are never actually deleted | NONE |

## Support & admin

| Data | Data Subject | Source | Purpose | Storage | Processor / Third Party | Retention | Deletion |
|---|---|---|---|---|---|---|---|
| Support ticket body, attachments | User | In-app support form | Customer support | `SupportTicket`, `SupportMessage` | — | Indefinite | NONE |
| Internal staff notes on tickets | N/A (staff-authored, about a user) | Admin support UI | Internal ops | `SupportMessage.internal=true` | — | Indefinite | NONE |
| Audit trail (actor, action, target, **IP**) | User (as actor) | Every meaningful admin/user action | Security, accountability | `AuditLog`, plaintext IP | — | Indefinite, **no TTL — explicitly excluded from cleanup job** (`janitor.ts`) | NONE |

## Affiliate program

The non-monetary AI-credit Referral system documented in earlier versions of this file has been **retired and removed** (29 Sept 2026) — code, UI, and the `Referral`/`ReferralReward` tables are gone, including their data (both were empty at removal time). The Affiliate program is now the only referral/commission mechanism in the app.

| Data | Data Subject | Source | Purpose | Storage | Processor / Third Party | Retention | Deletion |
|---|---|---|---|---|---|---|---|
| Affiliate payout reference | Affiliate (opted-in user) | Affiliate application | Real commission payouts | `Affiliate.payoutAccountRef` — documented as an opaque reference, never a full account/card number | Whatever real-world payout rail the admin uses (bank transfer, PayPal, etc. — manual, not integrated) | Indefinite | **RETAIN** — financial ledger |
| Visitor click tracking | Anonymous site visitor | Affiliate link click | Attribution | `AffiliateClick.visitorHash` — **SHA-256 of (IP+UA+day), not raw IP; rotates daily by construction** | — | Indefinite | NONE — but genuinely privacy-conscious design (no raw IP stored) |

## Cross-cutting gaps this table makes visible

1. **No table in this entire inventory has a working hard-delete or purge path**, except the narrow cases noted (BYOK key removal, expired tokens, terminal job rows, orphaned uploads — all handled by `src/lib/janitor.ts`, which explicitly documents that `Notification`, `WebhookDelivery`, `AuditLog`, `AutomationRun`, `PostMetric` are deliberately excluded pending "a retention policy first").
2. **The published Privacy Policy states a 30-day deletion promise this table shows isn't kept anywhere.** This is the single item worth fixing independent of DPDP timing.
3. Financial/ledger tables (`Invoice`, `AffiliateCommission`, `AffiliatePayout`) are correctly never deleted — that's expected recordkeeping behavior, not a gap.
