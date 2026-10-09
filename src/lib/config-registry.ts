import type { AdminPermission } from "@/lib/admin-permissions";

/**
 * The configs whose changes are versioned (see lib/config-versions). A staff member sees a config's history with its
 * view permission and can restore it with its manage permission, the same ones that guard the page that edits it.
 * Pure data: the restore action maps each key to the module's own save/reset function, so a restore goes through that
 * module's normal validation and cache invalidation.
 */
export type ConfigEntry = { key: string; label: string; view: AdminPermission; manage: AdminPermission; editedAt: string };

export const CONFIG_REGISTRY: readonly ConfigEntry[] = [
  { key: "site_branding", label: "Site branding", view: "marketing.view", manage: "marketing.manage", editedAt: "/admin/branding" },
  { key: "footer_config", label: "Footer & links", view: "marketing.view", manage: "marketing.manage", editedAt: "/admin/footer" },
  { key: "festival_config", label: "Festival themes", view: "marketing.view", manage: "marketing.manage", editedAt: "/admin/festivals" },
  { key: "review_config", label: "Review settings", view: "marketing.view", manage: "marketing.manage", editedAt: "/admin/reviews" },
  { key: "health_config", label: "Health probe settings", view: "system.view", manage: "system.manage", editedAt: "/admin/health" },
];

export const configEntry = (key: string): ConfigEntry | undefined => CONFIG_REGISTRY.find((c) => c.key === key);
