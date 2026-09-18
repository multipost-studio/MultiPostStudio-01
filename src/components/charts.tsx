"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatNumber } from "@/lib/utils";

const AXIS = { stroke: "var(--text-subtle)", fontSize: 11 };
const GRID = "var(--border)";

const tooltipStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--text)",
};

// Categorical palette — resolves from the design tokens so charts follow the
// theme (light/dark) and any future palette change automatically.
export const CHART_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--text-muted)",
];

/* Charts render at a fixed pixel height inside a fluid-width container. On a
   320px phone a 260px-tall chart with a legend and 3 series is mostly chrome,
   so small screens get a compact height while desktop keeps the designed one.
   matchMedia (not window.innerWidth at render) so rotation/resize updates. */
function useResponsiveHeight(base: number, small = 200): number {
  const [compact, setCompact] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return compact ? Math.min(base, small) : base;
}

export function TrendArea({
  data,
  dataKey,
  xKey = "label",
  height,
  color = "var(--primary)",
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  height?: number;
  color?: string;
}) {
  const h = useResponsiveHeight(height ?? 240);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(Number(v))} width={44} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatNumber(Number(v))} />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#g-${dataKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MultiLine({
  data,
  lines,
  xKey = "label",
  height,
}: {
  data: Record<string, unknown>[];
  lines: { key: string; label: string; color?: string }[];
  xKey?: string;
  height?: number;
}) {
  const h = useResponsiveHeight(height ?? 260);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(Number(v))} width={44} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l, i) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.label}
            stroke={l.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Bars({
  data,
  dataKey,
  xKey = "label",
  height,
  color = "var(--primary)",
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  height?: number;
  color?: string;
}) {
  const h = useResponsiveHeight(height ?? 240);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(Number(v))} width={44} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-hover)" }} formatter={(v) => formatNumber(Number(v))} />
        <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  data,
  height,
}: {
  data: { name: string; value: number; color?: string }[];
  height?: number;
}) {
  const h = useResponsiveHeight(height ?? 220);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={54} outerRadius={80} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ---------------- Heatmap (weekday x hour) ---------------- */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Heatmap({
  cells,
  metricLabel = "avg engagement",
}: {
  cells: { day: number; hour: number; value: number; posts: number }[];
  metricLabel?: string;
}) {
  const max = Math.max(0.0001, ...cells.map((c) => c.value));
  const at = (d: number, h: number) => cells.find((c) => c.day === d && c.hour === h);
  return (
    <div className="mps-scroll-x -mx-1 px-1" role="img" aria-label={`Engagement heatmap by weekday and hour. ${cells.filter((c) => c.posts > 0).length} time slots have posts.`}>
      <div className="min-w-[560px]">
        <div className="grid" style={{ gridTemplateColumns: `36px repeat(24, 1fr)` }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="pb-1 text-center text-[9px] text-[var(--text-subtle)]">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
          {DOW.map((label, d) => (
            <div key={d} className="contents">
              <div className="pr-1 text-right text-[10px] leading-[18px] text-[var(--text-subtle)]">{label}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const c = at(d, h);
                const intensity = c && c.posts > 0 ? 0.12 + 0.88 * (c.value / max) : 0;
                const cellLabel = c && c.posts > 0 ? `${label} ${h}:00 · ${c.value.toFixed(1)}% ${metricLabel} · ${c.posts} post${c.posts === 1 ? "" : "s"}` : `${label} ${h}:00 · no posts`;
                return (
                  <div
                    key={h}
                    title={cellLabel}
                    /* title="" is hover-only: the aria-label exposes the same
                       value to screen readers and touch inspection. */
                    aria-label={cellLabel}
                    role="img"
                    className="m-[1px] h-[16px] rounded-[3px] border border-[var(--border)]"
                    style={{
                      background: c && c.posts > 0 ? `color-mix(in srgb, var(--primary) ${Math.round(intensity * 100)}%, var(--surface))` : "var(--surface)",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
