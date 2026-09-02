import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + "K";
  return String(n);
}

export function formatPercent(n: number, digits = 1): string {
  return `${n >= 0 ? "" : ""}${n.toFixed(digits)}%`;
}

export function formatCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function formatDate(d: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", opts ?? { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const mins = 60_000, hours = 3_600_000, days = 86_400_000;
  if (abs < hours) return rtf.format(Math.round(diff / mins), "minute");
  if (abs < days) return rtf.format(Math.round(diff / hours), "hour");
  if (abs < days * 30) return rtf.format(Math.round(diff / days), "day");
  return rtf.format(Math.round(diff / (days * 30)), "month");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

/** Stable 32-bit hash for deterministic per-string styling (avatar hues, etc.). */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic hue from a string, kept in the brand's green→teal band
 *  (100–165) so identicon avatars stay on-palette. */
export function hueFromString(s: string): number {
  return hashString(s) % 16; // red band (deep red -> red-orange)
}

/** Deterministic real portrait photo for a name (randomuser.me — free, CC0). */
export function photoUrl(seed: string): string {
  const h = hashString(seed);
  const gender = h % 2 === 0 ? "women" : "men";
  return `https://randomuser.me/api/portraits/${gender}/${h % 100}.jpg`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Deterministic pseudo-random in [0,1) from a string seed. Used for stub AI + demo data. */
export function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1).trimEnd() + "…" : s;
}
