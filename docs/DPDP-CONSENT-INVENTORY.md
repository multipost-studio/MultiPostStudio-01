# DPDP Consent Inventory

Engineering compliance document — not legal advice. Lists every processing activity and the legal basis it actually rests on, per `docs/DPDP-DATA-INVENTORY.md`. **Finding worth stating plainly: almost nothing in this product currently relies on consent as its legal basis.** Most core-service processing rests on the data having been voluntarily provided for a specified purpose the user directly asked for (DPDP Act §7(a): the person requested account creation / platform connection / publishing, and hasn't indicated they object) — that ground doesn't require a consent checkbox, but it does require the itemised notice we've now published (`/legal/dpdp-notice`). The one thing that genuinely needed explicit, recorded, opt-in consent — the Affiliate Program's terms and disclosure requirement — didn't have it wired up in code until this pass; that's fixed below.

| Processing activity | Consent required under DPDP? | Current mechanism | Recorded? | Withdrawable? | Status |
|---|---|---|---|---|---|
| Account creation (name, email, password) | No — §7(a) voluntary provision for the requested service | Signup form + notice via Privacy Policy / DPDP Notice | N/A | Delete account | OK |
| Social platform OAuth connection | No — §7(a), same ground; the user directly initiates each connection | OAuth connect flow, explicit per-platform action | Implicit — the connection itself is the action, timestamped on `SocialAccount.createdAt` | Disconnect any time (immediate token deletion) | OK |
| AI feature usage (legacy or BYOK) | No — user directly requests each generation | In-app AI actions | N/A | Simply don't use the feature; BYOK key removable any time | OK |
| Billing/payment processing | No — necessary to fulfil the paid plan the user chose | Checkout flow | Invoice/subscription records | Cancel subscription | OK |
| Cookies (essential/session only) | No — DPDP doesn't have a separate cookie-consent mandate like the EU's ePrivacy rules, and no non-essential cookie is set | N/A — no tracking cookie exists | N/A | N/A | OK — Cookie Policy corrected this pass to stop implying a consent mechanism exists for a feature that doesn't |
| Marketing/promotional email | N/A — **this feature doesn't exist.** `NotificationPref` only covers transactional notifications about the user's own activity (publish status, approvals, mentions, their own weekly digest/reports) | — | — | — | Confirmed via schema + grep: no newsletter/marketing-consent flag anywhere in the codebase. Nothing to fix; noting the absence so it isn't mistaken for an oversight |
| **Affiliate Program participation** | **Yes-in-spirit** — genuinely optional, separate from the core service, with a real disclosure obligation attached | Checkbox on the apply flow, linked to `/legal/affiliate-terms` | `Affiliate.termsAcceptedAt`, `disclosureAcknowledgedAt`, `termsVersion` set at application time (`src/lib/affiliates.ts` `ensureAffiliateApplication`) | Self-service withdrawal at `/settings/privacy` (`withdrawAffiliateConsentAction`), or admin suspend/terminate | OK |
| Support ticket submission | No — §7(a), user directly initiates to get help | Support form | Ticket record | N/A | OK |

## What this means for build priorities

Because so little rests on consent, the highest-value Phase-3-adjacent work isn't a consent-management platform (there's nothing to manage) — it's making sure the **notice** is accurate and itemised (done — `/legal/dpdp-notice`) and that the **one real opt-in flow** (Affiliate) actually records what it claims to (done this pass). A generic cookie-consent banner would have been solving a problem this product doesn't have; per the original audit instruction not to add one "without understanding the actual tracking architecture," it wasn't built.

## Still open

- Self-service "leave the Affiliate Program" action for the data principal themselves (today, an affiliate account can be suspended/terminated by an admin, but there's no equivalent user-initiated action beyond simply not sharing their link).
- If marketing email is ever added in the future, it needs its own consent record (timestamp + notice version) before it ships — not retrofitted after.
