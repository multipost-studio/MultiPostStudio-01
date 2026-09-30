// Categorical chart palette — resolves from the design tokens so charts
// follow the theme (light/dark) and any future palette change automatically.
// Plain data, deliberately its own module: components/charts.tsx is a "use
// client" file, and importing a named export from a client module into a
// Server Component yields a client-reference proxy rather than the real
// value (CHART_COLORS[n] silently resolves to undefined, CHART_COLORS.map
// throws) — see admin/page.tsx, admin/plans/page.tsx, admin/usage/page.tsx,
// all Server Components that index into this.
export const CHART_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--text-muted)",
];
