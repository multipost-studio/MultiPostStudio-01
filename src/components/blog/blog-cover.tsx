import * as React from "react";
import {
  Activity, Bot, Briefcase, CalendarCheck, CalendarClock, Clock, Compass, Flag, Hash, Image as ImageIcon, Layers, Lightbulb,
  ListChecks, MessageSquare, PieChart, ShieldCheck, Sparkles, Target, TrendingUp, Type, Users, Wand2, Zap, BarChart3,
  type LucideIcon,
} from "lucide-react";
import { PlatformBadge } from "@/components/brand";
import { cn } from "@/lib/utils";
import { coverShapes, coverTheme, detectPlatform, seedFor } from "@/lib/blog-art";

type CategoryArt = { hero: LucideIcon; chips: [LucideIcon, LucideIcon, LucideIcon] };

const ART: Record<string, CategoryArt> = {
  "Platform Guides": { hero: Layers, chips: [Hash, Type, ImageIcon] },
  "Scheduling & Workflow": { hero: CalendarClock, chips: [Clock, CalendarCheck, ListChecks] },
  Strategy: { hero: Compass, chips: [Target, Lightbulb, Flag] },
  Analytics: { hero: BarChart3, chips: [TrendingUp, PieChart, Activity] },
  "AI & Automation": { hero: Sparkles, chips: [Wand2, Bot, Zap] },
  "Agencies & Teams": { hero: Users, chips: [Briefcase, ShieldCheck, MessageSquare] },
};

const SIZES = {
  sm: { tile: "h-12 w-12 rounded-2xl", icon: 22, badge: 26, chip: "h-6 w-6 rounded-lg", chipIcon: 12 },
  md: { tile: "h-[72px] w-[72px] rounded-3xl", icon: 34, badge: 44, chip: "h-8 w-8 rounded-xl", chipIcon: 16 },
  lg: { tile: "h-28 w-28 rounded-[2rem]", icon: 52, badge: 68, chip: "h-11 w-11 rounded-2xl", chipIcon: 22 },
} as const;

/** Where the three floating chips sit (percent offsets), mirrored/rotated by the post's seed. */
const CHIP_SPOTS = [
  { left: "13%", top: "20%" },
  { right: "12%", top: "28%" },
  { left: "20%", bottom: "17%" },
] as const;

/** Chip position, mirrored left-to-right on every other post so covers differ without any two chips colliding. */
function spotFor(i: number, flip: boolean): React.CSSProperties {
  const spot: { left?: string; right?: string; top?: string; bottom?: string } = CHIP_SPOTS[i];
  if (!flip) return spot;
  return { top: spot.top, bottom: spot.bottom, left: spot.right, right: spot.left };
}

/**
 * Generated cover art for a blog post: a category-coloured gradient, soft shapes
 * unique to the post, and a glass tile showing the platform the post is about
 * (or the category's symbol). Pure SVG/CSS, no network, deterministic per slug,
 * so it can never fail to load and never changes between renders.
 */
export function BlogCover({
  slug,
  title,
  category,
  size = "md",
  className,
}: {
  slug: string;
  title: string;
  category: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const theme = coverTheme(category);
  const art = ART[category ?? ""] ?? ART["Platform Guides"];
  const seed = seedFor(slug);
  const shapes = coverShapes(seed);
  const platform = category === "Platform Guides" || !category ? detectPlatform(`${slug} ${title}`) : detectPlatform(slug);
  const s = SIZES[size];
  const Hero = art.hero;
  const flip = seed % 2 === 1;

  return (
    <div
      role="img"
      aria-label={`${category ?? "Blog"} cover art for ${title}`}
      className={cn("relative isolate aspect-[16/9] w-full overflow-hidden", className)}
      style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <radialGradient id={`glow-${seed}`} cx="50%" cy="45%" r="60%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#glow-${seed})`} />
        {shapes.map((sh, i) =>
          sh.kind === "disc" ? (
            <circle key={i} cx={sh.x} cy={sh.y} r={sh.r} fill="#fff" opacity={sh.o} />
          ) : (
            <circle key={i} cx={sh.x} cy={sh.y} r={sh.r} fill="none" stroke="#fff" strokeWidth="0.8" opacity={sh.o + 0.18} />
          ),
        )}
      </svg>

      {/* floating chips */}
      {art.chips.map((Chip, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("absolute flex items-center justify-center border border-white/35 bg-white/20 text-white shadow-lg backdrop-blur-sm", s.chip)}
          style={{
            ...spotFor(i, flip),
            animation: `mps-float ${5 + i * 1.3}s ease-in-out ${i * 0.7}s infinite`,
          }}
        >
          <Chip size={s.chipIcon} />
        </span>
      ))}

      {/* hero tile */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={cn(
            "flex items-center justify-center border border-white/45 bg-white/25 text-white shadow-2xl backdrop-blur-md transition-transform duration-500 ease-out group-hover/cover:scale-110 group-hover/card:scale-110",
            s.tile,
          )}
          style={{ animation: "mps-float 7s ease-in-out infinite" }}
        >
          {platform ? <PlatformBadge platform={platform} size={s.badge} /> : <Hero size={s.icon} strokeWidth={1.75} />}
        </div>
      </div>
    </div>
  );
}
