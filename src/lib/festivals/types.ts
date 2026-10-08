/** Shared types for the festival themes module. Pure data, safe in client and server bundles. */

export type EffectKind =
  | "confetti"
  | "snow"
  | "petals"
  | "embers"
  | "powder"
  | "hearts"
  | "stars"
  | "lanterns"
  | "fireworks"
  | "leaves"
  | "spooky";

export type Intensity = "low" | "medium" | "high";

/** How a festival's date is worked out for a given Gregorian year. */
export type DateRule =
  | { kind: "fixed"; month: number; day: number }
  /** weekday 0 = Sunday … 6 = Saturday; nth is 1-based. */
  | { kind: "nthWeekday"; month: number; weekday: number; nth: number }
  | { kind: "easter" }
  /** Hijri month/day (Umm al-Qura calendar, computed with Intl). */
  | { kind: "islamic"; month: number; day: number; corrections?: Record<number, string> }
  /** Chinese calendar month/day (computed with Intl). */
  /** corrections: year -> "MM-DD" where the engine's astronomy is a day off a published date. */
  | { kind: "chinese"; month: number; day: number; corrections?: Record<number, string> }
  /** Hand-kept dates for calendars Intl cannot compute: year -> "MM-DD". */
  | { kind: "table"; dates: Record<number, string> };

export type FestivalRegion = "Global" | "India" | "Islamic" | "East Asia" | "West";

export type Festival = {
  id: string;
  name: string;
  emoji: string;
  region: FestivalRegion;
  blurb: string;
  /** 3-4 hex colours: ribbon gradient, glow and particle palette. */
  colors: string[];
  effect: EffectKind;
  greeting: string;
  /** Default window around the date, in days. */
  before: number;
  after: number;
  /** Higher wins when two windows overlap. */
  priority: number;
  rule: DateRule;
  /** Dates come from a hand-kept table or moon-based rules: admins can override per year. */
  approximate?: boolean;
};

export type FestivalEffects = {
  /** Falling / rising canvas particles. */
  particles: boolean;
  /** Short greeting pill when a visitor first sees the festival each day. */
  greeting: boolean;
  /** Top ribbon + soft colour wash. */
  glow: boolean;
  /** Tint highlight colours (--accent) with the festival palette. */
  recolor: boolean;
};

export type FestivalAudience = {
  marketing: boolean;
  app: boolean;
  admin: boolean;
};

export type FestivalOverride = {
  /** false keeps this festival out of automatic scheduling. Default true. */
  auto?: boolean;
  before?: number;
  after?: number;
  message?: string;
  /** YYYY-MM-DD: replaces the computed date in that date's year. */
  dateOverride?: string;
};

export type CustomFestival = {
  id: string;
  name: string;
  /** Borrows colours and effect from a preset. */
  themeId: string;
  startsOn: string;
  endsOn: string;
  yearly: boolean;
  message?: string;
};

export type FestivalConfig = {
  /** Master switch: off hides everything, whatever else is set. */
  enabled: boolean;
  /** Turn festivals on and off by the calendar. */
  autoMode: boolean;
  timezone: string;
  intensity: Intensity;
  effects: FestivalEffects;
  audience: FestivalAudience;
  /** Admin override that wins over the calendar. */
  manual: { festivalId: string | null; until: string | null };
  overrides: Record<string, FestivalOverride>;
  custom: CustomFestival[];
};

export type ActiveSource = "manual" | "custom" | "auto";

/** What the public API returns: just enough for the client layer to paint. */
export type ActiveFestival = {
  id: string;
  /** Preset whose colours / effect are used (custom festivals borrow one). */
  themeId: string;
  name: string;
  message: string;
  source: ActiveSource;
  startsOn: string;
  endsOn: string;
};

export type UpcomingFestival = { id: string; name: string; emoji: string; startsOn: string; endsOn: string; date: string; daysAway: number };

export type Resolution = {
  today: string;
  active: ActiveFestival | null;
  upcoming: UpcomingFestival[];
};
