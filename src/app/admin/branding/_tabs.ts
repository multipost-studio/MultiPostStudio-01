/** The Site Branding tabs. A plain module (not "use client") so the server page can read it too. */
export const TABS = ["social", "credits", "tags", "share", "invoice", "stats"] as const;
export type TabId = (typeof TABS)[number];
