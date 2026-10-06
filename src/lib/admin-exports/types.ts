import type { AdminQuery, AdminQueryOpts } from "@/lib/admin-query";

export type ExportCell = string | number | boolean | null | undefined | Date;

export type ExportResult = { header: string[]; rows: ExportCell[][] };

/**
 * One exportable admin list. The page and its export both build their database
 * query from the SAME `queryOpts` and `where` function defined next to the
 * dataset, so the file always contains exactly the rows the filtered page
 * shows (minus pagination). Nothing here may select secrets: no password
 * hashes, 2FA secrets, OAuth tokens or API keys, ever.
 */
export type ExportDataset = {
  type: string;
  label: string;
  queryOpts: AdminQueryOpts;
  /** Load up to `limit` rows in the page's sort order. */
  load(query: AdminQuery, limit: number): Promise<ExportResult>;
};

export const iso = (d: Date | null | undefined): string => (d ? d.toISOString() : "");
export const yn = (b: boolean | null | undefined): string => (b ? "yes" : "no");
