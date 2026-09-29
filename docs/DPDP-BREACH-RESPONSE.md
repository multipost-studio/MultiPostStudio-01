# Personal Data Breach Response

Engineering compliance document — not legal advice. Written against the verbatim text of **Rule 7 of the DPDP Rules, 2025** ("Intimation of personal data breach"), confirmed against the rule-text mirror during the Phase 1 legal research (Gazette notification dated 13 Nov 2025; Rule 7 falls under the group of rules with an 18-month compliance transition, deadline 13 May 2027 per the phased-enforcement timeline). Not yet exercised in a real incident — this is the process to follow when one happens, written in advance.

## What Rule 7 actually requires (verbatim, not paraphrased)

**To affected Data Principals** — "on becoming aware of any personal data breach," the Data Fiduciary shall, to the best of its knowledge, intimate each affected Data Principal **"in a concise, clear and plain manner and without delay"** through their user account or registered contact method, including:
1. A description of the breach — nature, extent, timing of occurrence
2. Consequences relevant to them
3. Measures implemented/being implemented to mitigate risk
4. Safety measures they can take themselves
5. Business contact information of someone who can respond to their queries

**To the Data Protection Board** — two-stage:
1. **Without delay**: a description of the breach — nature, extent, timing, location of occurrence, likely impact
2. **Within 72 hours** of becoming aware (or a longer period the Board grants on written request): updated/detailed information, the facts and circumstances leading to the breach, mitigation measures, findings on who caused it, remedial measures taken, and a report on what was told to affected Data Principals

Note what Rule 7 does **not** say: there's no separate numeric deadline for the Data-Principal-facing notification — it's "without delay," not "within 72 hours." The 72-hour clock is specifically the Board's detailed follow-up report.

The Board's own complaint-handling and investigation function isn't fully operational yet (constituted per the immediate Nov 2025 provisions, but the underlying 18-month organizational-compliance window runs to May 2027) — that doesn't change when the Data-Principal-facing obligation applies, since "without delay" isn't tied to the Board being operational.

## Internal process

### 1. Detection
Sources that could surface a breach today: Sentry error alerts (now wired in — see `docs/DPDP-DATA-MAP.md`), an admin noticing anomalous data in `/admin/audit` or `/admin/security`, a report from a user or a connected platform, or a third-party processor (Stripe, Razorpay, Resend, the S3-compatible storage provider) notifying us of an incident on their end.

### 2. Triage
First platform admin aware:
- Confirms it's a real personal-data exposure, not a false alarm or a purely internal/non-personal-data issue
- Assesses rough severity: how many data principals, what categories of data (credentials/tokens are more severe than, say, a display name), whether it's ongoing or contained
- Escalates to whoever else needs to know immediately (currently: any platform admin, per the flat `isPlatformAdmin` role — see the admin-role-tiering gap noted in `DPDP-COMPLIANCE-MATRIX` below)

### 3. Containment
Depends entirely on the breach, but the tools that already exist and apply here:
- Revoke a compromised session: `revokeUserDeviceAction` / `db.session.deleteMany`
- Rotate `TOKEN_ENC_KEY` if OAuth-token encryption itself were ever compromised (re-encrypts nothing automatically — every connected account would need to be reconnected; this is a last-resort, high-blast-radius action)
- Suspend an affected org/user: `setOrgSuspendedAction` / `deleteUserAction` (soft)
- Rotate any exposed third-party API key (Stripe, Razorpay, Resend, AI provider) at the provider's dashboard

### 4. Investigation
- Pull the relevant `AuditLog` rows (actor, action, target, IP — already retained indefinitely, see `DPDP-RETENTION-POLICY.md`)
- Check Sentry for the error/request chain around the incident window
- Identify exactly which `PrivacyRequest`-inventory data categories (see `DPDP-DATA-INVENTORY.md`) were exposed and to whom

### 5. Notify the Board — within 72 hours of becoming aware
Until the Board's technical reporting channel is confirmed live, notification is a manual written submission to the Data Protection Board of India through whatever channel is officially designated at the time. Document what was sent and when — this itself becomes part of the audit trail (log it via `logAudit` with a dedicated `action: "BREACH_BOARD_NOTIFIED"`, or file it as an internal record if no code path exists yet).

### 6. Notify affected Data Principals — without delay
- If the affected users are identifiable in the database, notify each one directly (the mechanism doesn't exist as an automated flow yet — send manually via the existing email adapter, `src/lib/adapters/email.ts`, using the 5 content elements Rule 7(1) requires, listed above)
- If the breach is broad enough to affect a large share of users, consider also posting a public notice, without that replacing the individual notification

### 7. Remediation and close-out
- Fix the root cause
- Record what was found, what was done, and when, in a durable place — this doc's own future revisions, or a dedicated incident record if the volume of real incidents ever justifies building `AuditLog`-backed tooling for it (deliberately not built speculatively — see Phase 38 note below)

## What wasn't built this pass, and why

The original spec suggested a dedicated `BreachIncident` admin model/UI (Phase 38). Not built: there's no history of incidents to manage yet, and a table with zero real rows isn't infrastructure, it's decoration. The existing `AuditLog` + `logAudit()` pattern already used everywhere else in this codebase is the right substrate if/when a real incident needs tracking — reuse it with a dedicated `action` prefix (`BREACH_*`) rather than standing up a parallel system. If incident volume ever justifies a dedicated queue (the same way `PrivacyRequest` justified itself once there were multiple *kinds* of tracked request with different resolution workflows), build it then, against real requirements instead of a hypothetical one.

## Contacts

- Internal: any platform admin (`isPlatformAdmin`)
- External data-principal contact point: `multipoststudio@gmail.com` (already published on every legal page)
- Data Protection Board of India: submission channel to be confirmed once the Board's public-facing process is live — **LEGAL REVIEW REQUIRED** to confirm the correct channel at the time of any real incident, since this is exactly the kind of detail that can change before the Board's tooling matures.
