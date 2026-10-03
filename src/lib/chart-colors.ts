// Categorical chart palette — the Ember brand series (flame → amber →
// ember tints) so charts follow the new identity automatically. The last
// two slots resolve from theme tokens so charts stay legible in both dark
// and light themes (fixed snow would vanish on white, fixed ink on black).
// Plain data, deliberately its own module: components/charts.tsx is a "use
// client" file, and importing a named export from a client module into a
// Server Component yields a client-reference proxy rather than the real
// value (CHART_COLORS[n] silently resolves to undefined, CHART_COLORS.map
// throws) — see admin/page.tsx, admin/plans/page.tsx, admin/usage/page.tsx,
// all Server Components that index into this.
export const CHART_COLORS = [
  "#FF4D0E",
  "#FEB804",
  "#FF8A50",
  "#FFD166",
  "var(--chart-neutral)",
  "var(--chart-muted)",
];
