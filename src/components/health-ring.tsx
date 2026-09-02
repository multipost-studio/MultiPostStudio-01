import { cn } from "@/lib/utils";

export function HealthRing({
  score,
  size = 120,
  label = "Health",
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c - (pct / 100) * c;
  const color =
    pct >= 80 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={10} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-semibold tabular-nums text-[var(--text)]")} style={{ fontSize: size * 0.26 }}>
          {Math.round(pct)}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">{label}</span>
      </div>
    </div>
  );
}
