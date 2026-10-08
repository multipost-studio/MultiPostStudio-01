/**
 * Which part of the product a pathname belongs to, so an admin can show festival
 * effects on the marketing site, in the app, in the admin panel, or any mix.
 * Mirrors the app prefixes the proxy gates (src/proxy.ts).
 */
export type Area = "marketing" | "app" | "admin";

const APP_PREFIXES = [
  "/dashboard", "/ideas", "/studio", "/templates", "/composer", "/calendar", "/queue", "/inbox", "/comments",
  "/analytics", "/campaigns", "/reports", "/insights", "/trends", "/competitors", "/opportunities", "/media",
  "/automations", "/recycling", "/team", "/approvals", "/integrations", "/settings", "/agency", "/onboarding",
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export function areaOf(pathname: string): Area {
  if (under(pathname, "/admin")) return "admin";
  return APP_PREFIXES.some((p) => under(pathname, p)) ? "app" : "marketing";
}
