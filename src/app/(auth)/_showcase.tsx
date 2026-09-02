import {
  TrendingUp,
  Sparkles,
  CalendarClock,
  Inbox,
  CheckCheck,
  Brain,
  Activity,
  Share2,
  ArrowUpRight,
} from "lucide-react";

/**
 * Decorative right-hand panel for the auth split layout: a continuously
 * drifting violet→pink aurora field with frosted "glass" feature cards that
 * scroll vertically in an infinite loop. Each card reacts to hover (lift,
 * scale, brighten) and hovering the strip pauses the scroll. Pure CSS motion
 * — see .auth-aurora / .auth-vtrack / .auth-card in globals.css. Honors
 * prefers-reduced-motion (global rule freezes all animation).
 */

type Viz = "spark" | "bars" | "donut" | "heat" | "pills" | "avatars" | "stages" | "dots";

type Card = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  kicker: string;
  stat: string;
  statSuffix?: string;
  sub: string;
  viz: Viz;
  w: string;
  align?: "start" | "end";
  mb: string;
};

const CARDS: Card[] = [
  {
    icon: TrendingUp,
    kicker: "Audience growth",
    stat: "+3,410",
    statSuffix: "followers / 30d",
    sub: "Compounding week over week across every channel.",
    viz: "spark",
    w: "w-[58%]",
    align: "end",
    mb: "mb-9",
  },
  {
    icon: Sparkles,
    kicker: "AI Content Studio",
    stat: "1,240",
    statSuffix: "captions drafted",
    sub: "Hooks, captions and hashtags tuned to your Brand Brain.",
    viz: "pills",
    w: "w-[72%]",
    mb: "mb-9",
  },
  {
    icon: Activity,
    kicker: "Engagement",
    stat: "+78.12%",
    statSuffix: "last month",
    sub: "Recent strategy and content changes are landing.",
    viz: "bars",
    w: "w-[76%]",
    mb: "mb-9",
  },
  {
    icon: CalendarClock,
    kicker: "Smart scheduling",
    stat: "2h 14m",
    statSuffix: "to next slot",
    sub: "The queue posts each channel at its best time.",
    viz: "heat",
    w: "w-[64%]",
    align: "end",
    mb: "mb-9",
  },
  {
    icon: Inbox,
    kicker: "Unified inbox",
    stat: "38",
    statSuffix: "open · 0 missed",
    sub: "Comments, DMs and mentions in one place with AI replies.",
    viz: "avatars",
    w: "w-[70%]",
    mb: "mb-9",
  },
  {
    icon: CheckCheck,
    kicker: "Approvals",
    stat: "12",
    statSuffix: "cleared this week",
    sub: "Multi-stage review with an immutable audit trail.",
    viz: "stages",
    w: "w-[74%]",
    align: "end",
    mb: "mb-9",
  },
  {
    icon: Brain,
    kicker: "AI Insights",
    stat: "3",
    statSuffix: "new this morning",
    sub: "Not just charts — what happened, why, and what to do next.",
    viz: "donut",
    w: "w-[66%]",
    mb: "mb-9",
  },
  {
    icon: Share2,
    kicker: "Connected platforms",
    stat: "9",
    statSuffix: "publishing live",
    sub: "Instagram, LinkedIn, X, TikTok, YouTube, Threads and more.",
    viz: "dots",
    w: "w-[60%]",
    align: "end",
    mb: "mb-16",
  },
];

export function AuthShowcase() {
  return (
    <div className="relative hidden overflow-hidden lg:block">
      {/* looping aurora field */}
      <div
        className="auth-aurora absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 45% at 15% 15%, var(--wash-a) 0%, transparent 60%)," +
            "radial-gradient(55% 50% at 85% 25%, var(--wash-b) 0%, transparent 55%)," +
            "radial-gradient(65% 60% at 70% 95%, var(--wash-c) 0%, transparent 60%)," +
            "linear-gradient(150deg, #c22c2c 0%, #8f1f1f 45%, #2a0d0d 100%)",
        }}
      />
      <div
        className="absolute -left-16 top-10 h-72 w-72 rounded-full opacity-60 blur-3xl"
        style={{
          background: "radial-gradient(circle, #e79a9a, transparent 70%)",
          animation: "cad-aurora-a 20s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -right-10 bottom-0 h-80 w-80 rounded-full opacity-50 blur-3xl"
        style={{
          background: "radial-gradient(circle, #f2f4f3, transparent 70%)",
          animation: "cad-aurora-b 26s ease-in-out infinite",
        }}
      />

      {/* infinite vertical card marquee — hover a card to pause + inspect */}
      <div className="auth-vmask absolute inset-0 flex items-start px-9">
        <div className="auth-vtrack flex w-full flex-col">
          <CardGroup />
          <CardGroup aria-hidden />
        </div>
      </div>
    </div>
  );
}

function CardGroup({ "aria-hidden": ariaHidden }: { "aria-hidden"?: boolean }) {
  return (
    <div aria-hidden={ariaHidden} className="flex flex-col pt-14">
      {CARDS.map((c, i) => (
        <div
          key={c.kicker}
          className={`auth-card ${c.mb} ${c.w} ${c.align === "end" ? "ml-auto" : ""}`}
          style={{
            animationDelay: `${-i * 1.6}s`,
            ["--bob-rot" as string]: i % 2 ? "-1.4deg" : "1.6deg",
          }}
        >
          <FeatureCard {...c} />
        </div>
      ))}
    </div>
  );
}

function FeatureCard({ icon: Icon, kicker, stat, statSuffix, sub, viz }: Card) {
  return (
    <div className="group cursor-default rounded-[var(--radius-lg)] border border-white/25 bg-white/15 p-5 shadow-[0_20px_50px_-20px_rgba(30,10,60,0.5)] backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-1.5 hover:scale-[1.03] hover:border-white/50 hover:bg-white/25 hover:shadow-[0_30px_64px_-18px_rgba(25,8,55,0.62)] active:scale-[1.01]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-white/70">
          <Icon size={13} className="text-white" />
          {kicker}
        </span>
        <ArrowUpRight
          size={14}
          className="text-white/60 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white"
        />
      </div>

      <p className="mt-1.5 flex items-end gap-1 text-[27px] font-bold leading-none text-white">
        {stat}
        {statSuffix && <span className="mb-0.5 text-[12px] font-medium text-white/70">{statSuffix}</span>}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-white/75">{sub}</p>

      <div className="mt-4">
        <VizBlock viz={viz} />
      </div>
    </div>
  );
}

function VizBlock({ viz }: { viz: Viz }) {
  if (viz === "spark") {
    return (
      <svg viewBox="0 0 200 56" className="w-full" aria-hidden>
        <polyline
          points="4,48 34,42 64,45 94,28 124,33 154,14 190,6"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-[stroke-width] duration-300 group-hover:[stroke-width:4]"
        />
        <circle cx="190" cy="6" r="4" fill="white" />
        <circle cx="190" cy="6" r="4" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="0" className="transition-all duration-300 [r:4] group-hover:[r:9] group-hover:[stroke-width:2]" />
      </svg>
    );
  }
  if (viz === "bars") {
    return (
      <div className="flex items-end gap-1.5">
        {[26, 38, 32, 50, 44, 62, 80].map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-[4px] bg-white/85 transition-all duration-300 group-hover:bg-white"
            style={{ height: h, opacity: 0.5 + i * 0.07 }}
          />
        ))}
      </div>
    );
  }
  if (viz === "donut") {
    return (
      <div className="flex items-center gap-3">
        <svg width="52" height="52" viewBox="0 0 36 36" aria-hidden className="shrink-0 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="5" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="white"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="94.2"
            strokeDashoffset="17"
            className="transition-[stroke-dashoffset] duration-500 group-hover:[stroke-dashoffset:6]"
          />
        </svg>
        <div className="text-[12px] leading-tight text-white/80">
          <p className="font-semibold text-white">82 / 100</p>
          <p>health score</p>
        </div>
      </div>
    );
  }
  if (viz === "heat") {
    return (
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 21 }).map((_, i) => {
          const on = [2, 4, 8, 9, 11, 13, 16, 18, 19].includes(i);
          return (
            <span
              key={i}
              className="aspect-square rounded-[3px] transition-colors duration-300"
              style={{ background: on ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)" }}
            />
          );
        })}
      </div>
    );
  }
  if (viz === "pills") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {["#hook", "#cta", "#hashtags", "+voice"].map((t) => (
          <span
            key={t}
            className="rounded-full border border-white/30 bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white/85 transition-colors duration-300 group-hover:bg-white/30"
          >
            {t}
          </span>
        ))}
      </div>
    );
  }
  if (viz === "avatars") {
    const hues = [265, 300, 210, 160, 330];
    return (
      <div className="flex -space-x-2">
        {hues.map((h, i) => (
          <span
            key={i}
            className="h-7 w-7 rounded-full border-2 border-white/30 transition-transform duration-300 group-hover:translate-y-[-2px]"
            style={{
              background: `linear-gradient(135deg, hsl(${h} 50% 48%), hsl(${(h + 14) % 360} 56% 34%))`,
              transitionDelay: `${i * 30}ms`,
            }}
          />
        ))}
        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/30 bg-white/20 text-[9px] font-bold text-white">
          +33
        </span>
      </div>
    );
  }
  if (viz === "stages") {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-semibold">
        {["Draft", "Review", "Live"].map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 transition-colors duration-300 ${
                i === 2
                  ? "bg-white text-[var(--primary)]"
                  : "border border-white/30 bg-white/10 text-white/85 group-hover:bg-white/25"
              }`}
            >
              {s}
            </span>
            {i < 2 && <span className="text-white/50">→</span>}
          </span>
        ))}
      </div>
    );
  }
  // dots
  return (
    <div className="flex flex-wrap gap-1.5">
      {["#E4405F", "#0A66C2", "#111", "#FF0050", "#FF0000", "#000", "#1DA1F2", "#E60023", "#25D366"].map(
        (c, i) => (
          <span
            key={i}
            className="h-5 w-5 rounded-full border border-white/40 transition-transform duration-300 group-hover:scale-110"
            style={{ background: c, transitionDelay: `${i * 25}ms` }}
          />
        ),
      )}
    </div>
  );
}
