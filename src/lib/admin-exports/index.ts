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

export type { ExportCell, ExportDataset, ExportResult } from "./types";
