# DPDP Retention & Deletion Policy

Engineering compliance document — not legal advice. Classifies every data category from `DPDP-DATA-INVENTORY.md` as `DELETE` (actively purged on a schedule), `RETAIN` (kept intentionally — financial/legal/audit record), `ANONYMIZE` (identity stripped, row kept for referential integrity), or `REVIEW` (no automated action yet; flagged for a future phase).

## Status: designed, not yet implemented

The Privacy Policy previously stated: *"When you delete your account, your workspaces, posts, media and connected-account tokens are deleted within 30 days."* Nothing in the code enforced that — `deleteOrgAction` only ever set `Organization.deletedAt` and left every related row in place indefinitely.

The purge job described below (`purgeDeletedOrgs()`) was designed to make that promise true, scoped precisely to the resources it names, without touching resources it doesn't name (financial records, audit trail, the `Organization` row itself). **Its implementation was blocked**: the code path that deletes objects from S3-compatible storage was refused by this environment's own bulk-cloud-storage-delete safety classifier, which flags mass-delete operations against cloud storage for explicit human sign-off before they can be written. That's a deliberate guardrail, not a bug — I'm not routing around it.

As an interim fix (this pass), the Privacy Policy copy has been corrected to describe what the system actually does today (soft-delete only) instead of a 30-day purge that doesn't run — see `src/app/(marketing)/legal/privacy/page.tsx`. The design below stays as the target implementation once a human explicitly grants the storage-delete permission this needs.

## Classification

| Data category | Classification | Trigger | Mechanism | Why |
|---|---|---|---|---|
| Workspace + everything under it (Post, PostVersion, PostChannel, MediaAsset, SocialAccount tokens, ConnectedIntegration tokens, ContentIdea, SocialContact, Conversation, Message, ThreadComment, ActivityEvent) | **DELETE (designed, blocked pending permission)** | `Organization.deletedAt` older than 30 days | Designed for `src/lib/janitor.ts` `purgeDeletedOrgs()` — delete S3-stored media objects first (best-effort), then `db.workspace.deleteMany({ where: { orgId } })`, which cascades through every Cascade-linked child table in the schema. **Not yet written** — see Status above | Schema confirms every listed table has `onDelete: Cascade` on its `workspaceId` FK, so deleting the `Workspace` rows would be sufficient — no need to touch each child table individually. Blocked only by the storage-delete permission gate, not by any technical or legal obstacle |
| `Organization` row itself | **RETAIN** | — | Not deleted, only soft-deleted (`deletedAt` set) | `Subscription`/`Invoice`/`UsageRecord` have a required, Cascade FK to `orgId` — hard-deleting the org would destroy financial records that must be kept. Keeping the (now content-empty) org row as an anchor is the safer design |
| `Invoice`, `Subscription`, `UsageRecord` | **RETAIN** | — | No deletion path (unchanged) | Financial recordkeeping — accounting/tax retention, independent of DPDP; also aligns with DPDP Rule 8(3)'s own minimum-retention floor for certain logs |
| `AuditLog` | **RETAIN** | — | `orgId` uses `onDelete: SetNull` — survives org content purge with `orgId` nulled, actor identity intact | Accountability/security record; excluded from the general janitor sweep by existing design |
| `SupportTicket`/`SupportMessage` | **RETAIN** (for now) | — | `orgId` uses `onDelete: SetNull` — survives | Support history has legitimate business value; no promise was made to delete it, and it may itself be evidence in a support/billing dispute. **REVIEW** in a later pass once a support-data retention window is actually decided |
| `Referral`/`ReferralReward`, `Affiliate*` | **RETAIN** | — | Unchanged | Financial/ledger-adjacent; `AffiliateClick.visitorHash` already avoids storing raw IP (SHA-256, daily-rotating) |
| `User` row (name, email, password hash, 2FA secret) | **REVIEW** | — | Currently soft-delete only (`deleteUserAction`) | Out of scope for this pass — the specific broken promise being fixed here is about org/workspace content, not individual user PII. Anonymizing the `User` row safely requires checking every FK that references `User.id` as an actor (dozens of tables) to avoid breaking referential integrity or silently erasing "who did this" from audit trails that must survive. Needs its own dedicated pass |
| `Device` (IP, user agent) | **REVIEW** | — | No TTL today | No promise currently made about this; flagged in the compliance matrix as a MEDIUM gap, not fixed this pass |
| `Notification`, `WebhookDelivery`, `PostMetric` | **REVIEW** | — | Unchanged, `janitor.ts` already documents these as excluded pending a retention decision | Same as before — no policy decision has been made on these yet |

## Purge mechanics (what actually runs)

- Runs inside the existing hourly `runJanitor()` tick — same throttle, same isolated try/catch-per-step pattern as every other janitor task, so a purge failure can never block publishing or the rest of the janitor run.
- Batched to 20 organizations per run (matches the existing orphan-upload sweep's caution) — a large backlog drains over several hours rather than in one long transaction.
- Idempotent by construction: an org with zero remaining workspaces is simply a no-op on the next run (nothing left to find).
- S3 object deletion is best-effort per object (a storage hiccup logs a warning and moves on — matches `deleteUpload`'s existing behavior elsewhere in the codebase) so a transient storage error never blocks the DB-side purge.
- Every purge is audit-logged (`org_data_purged`, with counts) so there's a record of when and how much was erased — the one thing this system is not allowed to do silently.

## Explicitly not done this pass

- No `User` row anonymization (see REVIEW above).
- No change to `Invoice`/`Subscription`/`AuditLog`/`SupportTicket` retention — intentionally untouched.
- No automatic purge of orgs that were never soft-deleted — this only acts on organizations an admin has already explicitly marked `deletedAt`.
