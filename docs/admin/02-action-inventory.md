# Admin action inventory

_Generated 2026-10-09. Columns are static signals, not a substitute for review: **audit** = the action writes an audit/activity record (directly or through the shared `apply` helper of the config modules); **validated** = input checks are visible in the body._

| Module | Action | Guard | Mutates | Audit | Input checks |
|---|---|---|---|---|---|
| admin-access.ts | `assignAdminRoleAction` | super admin | yes | yes | yes |
| admin-access.ts | `createCustomRoleAction` | super admin | yes | yes | yes |
| admin-access.ts | `deleteCustomRoleAction` | super admin | yes | yes | yes |
| admin-access.ts | `revokeAdminRoleAction` | super admin | yes | yes | yes |
| admin-access.ts | `updateCustomRoleAction` | super admin | yes | yes | yes |
| admin-branding.ts | `importBrandingAction` | permission: marketing.manage | yes | yes | yes |
| admin-branding.ts | `resetBrandingAction` | permission: marketing.manage | no | n/a | weak |
| admin-branding.ts | `saveBrandingAction` | permission: marketing.manage | yes | yes | yes |
| admin-branding.ts | `uploadBrandingImageAction` | permission: marketing.manage | yes | yes | weak |
| admin-config.ts | `restoreConfigRevisionAction` | permission (computed) | yes | yes | yes |
| admin-festivals.ts | `importFestivalConfigAction` | permission: marketing.manage | yes | yes | yes |
| admin-festivals.ts | `resetFestivalConfigAction` | permission: marketing.manage | no | n/a | weak |
| admin-festivals.ts | `saveFestivalConfigAction` | permission: marketing.manage | yes | yes | yes |
| admin-flags.ts | `importFeatureFlagsAction` | permission: flags.manage | yes | yes | yes |
| admin-footer.ts | `importFooterConfigAction` | permission: marketing.manage | yes | yes | yes |
| admin-footer.ts | `resetFooterConfigAction` | permission: marketing.manage | no | n/a | weak |
| admin-footer.ts | `saveFooterConfigAction` | permission: marketing.manage | yes | yes | yes |
| admin-health.ts | `getHealthStatsAction` | permission: system.view | no | n/a | yes |
| admin-health.ts | `getProbeHistoryAction` | permission: system.view | no | n/a | yes |
| admin-health.ts | `importHealthConfigAction` | permission: system.manage | no | n/a | yes |
| admin-health.ts | `pruneHealthHistoryAction` | permission: system.manage | no | n/a | weak |
| admin-health.ts | `resetHealthConfigAction` | permission: system.manage | no | n/a | weak |
| admin-health.ts | `runSingleProbeAction` | permission: system.manage | yes | yes | weak |
| admin-health.ts | `saveHealthConfigAction` | permission: system.manage | yes | yes | yes |
| admin-health.ts | `triggerHealthProbesAction` | permission: system.manage | no | n/a | yes |
| admin-incidents.ts | `updateIncidentAction` | permission: system.manage | yes | yes | yes |
| admin-notes.ts | `addAdminNoteAction` | permission: notes.manage | yes | yes | yes |
| admin-notes.ts | `deleteAdminNoteAction` | permission: notes.manage | yes | yes | yes |
| admin-notes.ts | `setAdminNotePinnedAction` | permission: notes.manage | yes | yes | yes |
| admin-notifications.ts | `dismissAdminItemAction` | permission: notifications.view | no | n/a | weak |
| admin-notifications.ts | `dismissAllAdminItemsAction` | permission: notifications.view | no | n/a | weak |
| admin-observability.ts | `clearSystemEventsAction` | permission: system.manage | yes | yes | weak |
| admin-observability.ts | `deleteSystemEventAction` | permission: system.manage | yes | yes | weak |
| admin-observability.ts | `emitDiagnosticEventAction` | permission: system.manage | no | n/a | weak |
| admin-observability.ts | `purgeOldSystemEventsAction` | full admin (delegates) | no | n/a | weak |
| admin-policies.ts | `publishPolicyVersionAction` | permission: privacy.manage | yes | yes | yes |
| admin-recovery.ts | `recordBackupCheckAction` | permission: system.manage | yes | yes | yes |
| admin-reviews.ts | `bulkReviewAction` | permission: marketing.manage | yes | yes | yes |
| admin-reviews.ts | `createReviewAction` | permission: marketing.manage | yes | yes | yes |
| admin-reviews.ts | `exportReviewsAction` | permission: marketing.manage | no | n/a | yes |
| admin-reviews.ts | `importReviewConfigAction` | permission: marketing.manage | no | n/a | yes |
| admin-reviews.ts | `importReviewsAction` | permission: marketing.manage | yes | yes | weak |
| admin-reviews.ts | `resetReviewConfigAction` | permission: marketing.manage | no | n/a | weak |
| admin-reviews.ts | `saveReviewConfigAction` | permission: marketing.manage | yes | yes | yes |
| admin-reviews.ts | `updateReviewAction` | permission: marketing.manage | yes | yes | yes |
| admin.ts | `adjustOrgCreditsAction` | permission: billing.manage | yes | yes | yes |
| admin.ts | `adminArchivePostAction` | permission: posts.manage | yes | yes | weak |
| admin.ts | `adminDisconnectSocialAction` | permission: integrations.manage | yes | yes | weak |
| admin.ts | `adminSetOrgPlanAction` | permission: billing.manage | no | n/a | weak |
| admin.ts | `broadcastNotificationAction` | permission: broadcast.send | yes | yes | yes |
| admin.ts | `bulkRetryFailedPublishJobsAction` | permission: queue.manage | yes | yes | weak |
| admin.ts | `cancelPublishJobAction` | permission: queue.manage | yes | yes | weak |
| admin.ts | `clearAllTotpLockoutsAction` | permission: security.manage | yes | yes | weak |
| admin.ts | `createCouponAction` | permission: billing.manage | yes | yes | weak |
| admin.ts | `createPlanAction` | permission: plans.manage | yes | yes | yes |
| admin.ts | `deleteCmsEntryAction` | permission: content.manage | yes | yes | weak |
| admin.ts | `deleteCouponAction` | permission: billing.manage | yes | yes | weak |
| admin.ts | `deleteOrgAction` | permission: orgs.manage | yes | yes | weak |
| admin.ts | `deletePlanAction` | permission: plans.manage | yes | yes | weak |
| admin.ts | `deleteUserAction` | permission: users.manage | yes | yes | weak |
| admin.ts | `forceVerifyUserAction` | permission: users.manage | yes | yes | weak |
| admin.ts | `importUsersAction` | permission: users.manage | yes | yes | yes |
| admin.ts | `reschedulePublishJobAction` | permission: queue.manage | yes | yes | yes |
| admin.ts | `restoreOrgAction` | permission: orgs.manage | yes | yes | weak |
| admin.ts | `restoreUserAction` | permission: users.manage | yes | yes | weak |
| admin.ts | `retryPublishJobAction` | permission: queue.manage | yes | yes | yes |
| admin.ts | `revokeApiKeyAction` | permission: integrations.manage | yes | yes | weak |
| admin.ts | `revokeUserDeviceAction` | permission: users.manage | yes | yes | weak |
| admin.ts | `seedDefaultPlansAction` | permission: plans.manage | yes | yes | weak |
| admin.ts | `setCouponActiveAction` | permission: billing.manage | yes | yes | weak |
| admin.ts | `setFlagRolloutAction` | permission: flags.manage | yes | yes | yes |
| admin.ts | `setInvoiceStatusAction` | permission: billing.manage | yes | yes | yes |
| admin.ts | `setOrgSuspendedAction` | permission: orgs.manage | yes | yes | weak |
| admin.ts | `setSubscriptionStatusAction` | permission: billing.manage | yes | yes | yes |
| admin.ts | `setUserAdminAction` | super admin | yes | yes | weak |
| admin.ts | `setUserPlatformRoleAction` | super admin | yes | yes | weak |
| admin.ts | `setUserSuspendedAction` | permission: users.manage | yes | yes | weak |
| admin.ts | `setWebhookActiveAction` | permission: integrations.manage | yes | yes | weak |
| admin.ts | `toggleFeatureFlagAction` | permission: flags.manage | yes | yes | yes |
| admin.ts | `triggerManualQueueRunAction` | permission: queue.manage | no | n/a | weak |
| admin.ts | `unlockUserTotpAction` | permission: security.manage | yes | yes | weak |
| admin.ts | `updateOrgDetailsAction` | permission: orgs.manage | yes | yes | weak |
| admin.ts | `updatePlanAction` | permission: plans.manage | yes | yes | weak |
| admin.ts | `updateSiteSettingsAction` | permission: settings.manage | yes | yes | weak |
| admin.ts | `upsertCmsEntryAction` | permission: content.manage | yes | yes | yes |
| affiliates.ts | `adminAddAffiliateAdjustmentAction` | permission: affiliates.manage | yes | yes | weak |
| affiliates.ts | `adminApproveAffiliateAction` | permission: affiliates.manage | yes | yes | weak |
| affiliates.ts | `adminApproveCommissionAction` | permission: affiliates.manage | yes | yes | weak |
| affiliates.ts | `adminCreatePayoutAction` | permission: affiliates.manage | yes | yes | weak |
| affiliates.ts | `adminMarkPayoutPaidAction` | permission: affiliates.manage | yes | yes | weak |
| affiliates.ts | `adminRejectAffiliateAction` | permission: affiliates.manage | yes | yes | weak |
| affiliates.ts | `adminSetAffiliateStatusAction` | permission: affiliates.manage | yes | yes | weak |
| affiliates.ts | `getMyAffiliateAction` | permission: affiliates.manage | no | n/a | weak |
| blog-launch.ts | `previewLaunchBatchAction` | permission: content.manage | yes | **no** | weak |
| blog-launch.ts | `scheduleLaunchBatchAction` | permission: content.manage | yes | yes | weak |
| blog-launch.ts | `unscheduleLaunchBatchAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `aiBlogAssistAction` | permission: content.manage | no | n/a | weak |
| blog.ts | `autosaveBlogPostAction` | permission: content.manage | yes | **no** | weak |
| blog.ts | `bulkBlogPostAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `bulkModerateCommentsAction` | permission: content.manage | yes | yes | yes |
| blog.ts | `deleteBlogAuthorAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `deleteBlogCategoryAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `deleteBlogPostAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `deleteBlogTagAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `duplicateBlogPostAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `executeBlogImportAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `mergeBlogTagsAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `moderateBlogCommentAction` | permission: content.manage | yes | **no** | weak |
| blog.ts | `restoreBlogPostAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `restoreBlogPostRevisionAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `setBlogPostStatusAction` | permission: content.manage | yes | yes | weak |
| blog.ts | `updateBlogSettingsAction` | permission: content.manage | yes | yes | yes |
| blog.ts | `uploadBlogMediaAction` | permission: content.manage | yes | **no** | weak |
| blog.ts | `upsertBlogAuthorAction` | permission: content.manage | yes | **no** | weak |
| blog.ts | `upsertBlogCategoryAction` | permission: content.manage | yes | **no** | weak |
| blog.ts | `upsertBlogPostAction` | permission: content.manage | yes | yes | yes |
| blog.ts | `upsertBlogTagAction` | permission: content.manage | yes | **no** | weak |
| impersonation.ts | `impersonateUserAction` | full admin (impersonation) | no | n/a | weak |
| impersonation.ts | `stopImpersonatingAction` | full admin (impersonation) | yes | yes | weak |
| marketing-admin.ts | `broadcastToAudienceAction` | permission: broadcast.send | yes | yes | weak |
| marketing-admin.ts | `deleteSegmentAction` | permission: marketing.manage | yes | yes | weak |
| marketing-admin.ts | `previewAudienceAction` | permission: marketing.view | no | n/a | weak |
| marketing-admin.ts | `saveSegmentAction` | permission: marketing.manage | yes | yes | yes |
| platform-rules.ts | `resetPlatformRuleAction` | permission: settings.manage | yes | yes | weak |
| platform-rules.ts | `updatePlatformRuleAction` | permission: settings.manage | yes | yes | yes |
| privacy.ts | `adminResolvePrivacyRequestAction` | permission: privacy.manage | yes | yes | weak |
| promo-cards.ts | `archivePromoCardAction` | permission: marketing.manage | yes | yes | weak |
| promo-cards.ts | `createPromoCardAction` | permission: marketing.manage | yes | yes | weak |
| promo-cards.ts | `deletePromoCardAction` | permission: marketing.manage | yes | yes | weak |
| promo-cards.ts | `seedStarterPromoCardsAction` | permission: marketing.manage | yes | yes | yes |
| promo-cards.ts | `setPromoCardEnabledAction` | permission: marketing.manage | yes | yes | weak |
| promo-cards.ts | `updatePromoCardAction` | permission: marketing.manage | yes | yes | weak |
| promo-cards.ts | `uploadPromoImageAction` | permission: marketing.manage | yes | **no** | weak |
| revenue.ts | `fetchLatestFxRatesAction` | permission: billing.manage | no | n/a | weak |
| revenue.ts | `saveFxRatesAction` | permission: billing.manage | yes | yes | weak |
| support.ts | `assignTicketAction` | permission: support.manage | yes | yes | weak |
| support.ts | `replyToTicketAction` | NONE (review) | yes | **no** | weak |
| support.ts | `setTicketPriorityAction` | permission: support.manage | yes | yes | yes |
| support.ts | `setTicketStatusAction` | permission: support.manage | yes | yes | yes |

## Mutating actions with no audit record (9)

These are the remaining gaps, kept visible on purpose. Most are routine content edits; none touch money, access, or platform switches.

- `blog-launch.ts` → `previewLaunchBatchAction`
- `blog.ts` → `autosaveBlogPostAction`
- `blog.ts` → `moderateBlogCommentAction`
- `blog.ts` → `uploadBlogMediaAction`
- `blog.ts` → `upsertBlogAuthorAction`
- `blog.ts` → `upsertBlogCategoryAction`
- `blog.ts` → `upsertBlogTagAction`
- `promo-cards.ts` → `uploadPromoImageAction`
- `support.ts` → `replyToTicketAction`
