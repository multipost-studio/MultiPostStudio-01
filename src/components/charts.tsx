"use client";

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

// "Lush" categorical palette — natural, distinguishable, on-brand.
export const CHART_COLORS = ["#c22c2c", "#0a0908", "#8a8987", "#e0a3a3", "#4a5a68", "#b0862f"];

export function TrendArea({
  data,
  dataKey,
  xKey = "label",
  height = 240,
  color = "#c22c2c",
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
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
  height = 260,
}: {
  data: Record<string, unknown>[];
  lines: { key: string; label: string; color?: string }[];
  xKey?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
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
  height = 240,
  color = "#c22c2c",
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(Number(v))} width={44} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-hover)" }} formatter={(v) => formatNumber(Number(v))} />
        <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  data,
  height = 220,
}: {
  data: { name: string; value: number; color?: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
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
