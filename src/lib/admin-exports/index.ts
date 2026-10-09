import type { AdminPermission } from "@/lib/admin-permissions";
import { affiliatesDataset, orgsDataset, usersDataset } from "./accounts";
import { auditDataset, broadcastsDataset, eventsDataset, jobsDataset, postsDataset, privacyDataset, supportDataset } from "./activity";
import { invoicesDataset, plansDataset, subscriptionsDataset, usageDataset } from "./commerce";
import { aiDataset, cmsDataset, connectionsDataset, flagsDataset, securityDataset } from "./platform";
import type { ExportDataset } from "./types";

/** Every list that can be exported from the admin area, keyed by `?type=`. */
export const DATASETS: Record<string, ExportDataset> = Object.fromEntries(
  [
    usersDataset,
    orgsDataset,
    affiliatesDataset,
    auditDataset,
    postsDataset,
    jobsDataset,
    eventsDataset,
    privacyDataset,
    supportDataset,
    invoicesDataset,
    subscriptionsDataset,
    plansDataset,
    usageDataset,
    aiDataset,
    connectionsDataset,
    flagsDataset,
    cmsDataset,
    securityDataset,
    broadcastsDataset,
  ].map((d) => [d.type, d]),
);

/**
 * What a person must be allowed to VIEW before they may export a dataset. `data.export` alone is never enough: a role
 * that can export must also be able to see the data, so an export is never a way around a page the person cannot open.
 * A dataset missing from this map cannot be exported (fails closed).
 */
export const DATASET_VIEW_PERMISSION: Record<string, AdminPermission> = {
  users: "users.view",
  orgs: "orgs.view",
  affiliates: "affiliates.view",
  audit: "audit.view",
  posts: "posts.view",
  jobs: "queue.view",
  events: "system.view",
  privacy: "privacy.view",
  support: "support.view",
  broadcasts: "marketing.view",
  invoices: "billing.view",
  subscriptions: "billing.view",
  plans: "billing.view",
  usage: "usage.view",
  ai: "ai.view",
  connections: "integrations.view",
  flags: "flags.view",
  cms: "content.view",
  security: "security.view",
};

export type { ExportCell, ExportDataset, ExportResult } from "./types";
