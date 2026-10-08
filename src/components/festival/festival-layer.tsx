"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { areaOf } from "@/lib/festivals/areas";
import { FESTIVAL_BY_ID } from "@/lib/festivals/catalog";
import type { ActiveFestival, FestivalAudience, FestivalEffects, Intensity } from "@/lib/festivals/types";
import { startParticles } from "./particles";
import { PREVIEW_EVENT, readPreview, setFestivalPreview } from "./preview";

type Payload = {
  enabled: boolean;
  active: ActiveFestival | null;
  intensity?: Intensity;
  effects?: FestivalEffects;
  audience?: FestivalAudience;
};

const CACHE_KEY = "mps-festival-cache";
const OFF_KEY = "mps-festival-off";
const SEEN_KEY = "mps-festival-seen";
const CACHE_MS = 10 * 60_000;
const REFRESH_MS = 30 * 60_000;
const GREETING_MS = 9_000;
const PREVIEW_EFFECTS: FestivalEffects = { particles: true, greeting: true, glow: true, recolor: false };

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/**
 * Paints whichever festival theme the admin has made live: a thin colour ribbon
 * and wash, drifting particles, an optional tint of the highlight colour, and a
 * short greeting. It renders nothing on the server and until the (CDN-cached)
 * status arrives, so it can never cause a hydration mismatch, and any failure
 * simply leaves the site as it was. Visitors can switch it off for themselves.
 */
export function FestivalLayer() {
  const pathname = usePathname();
  const [payload, setPayload] = React.useState<Payload | null>(null);
  const [off, setOff] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [greetingGone, setGreetingGone] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    setOff(safe(() => window.localStorage.getItem(OFF_KEY) === "1", false));
    const sync = () => setPreview(readPreview());
    sync();
    window.addEventListener(PREVIEW_EVENT, sync);
    return () => window.removeEventListener(PREVIEW_EVENT, sync);
  }, []);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/festival/active");
        if (!res.ok) return;
        const data = (await res.json()) as Payload;
        if (!alive) return;
        setPayload(data);
        safe(() => window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })), undefined);
      } catch {
        /* offline or blocked: keep whatever is showing */
      }
    };
    const cached = safe(() => JSON.parse(window.sessionStorage.getItem(CACHE_KEY) ?? "null") as { at: number; data: Payload } | null, null);
    if (cached && Date.now() - cached.at < CACHE_MS) setPayload(cached.data);
    else void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const area = areaOf(pathname || "/");
  const live = payload?.enabled && payload.active && payload.audience?.[area] && !off ? payload.active : null;
  const previewTheme = preview ? FESTIVAL_BY_ID[preview] : undefined;
  const themeId = previewTheme ? previewTheme.id : live?.themeId;
  const theme = themeId ? FESTIVAL_BY_ID[themeId] : undefined;
  const effects = previewTheme ? PREVIEW_EFFECTS : (payload?.effects ?? PREVIEW_EFFECTS);
  const intensity = previewTheme ? "medium" : (payload?.intensity ?? "medium");
  const message = previewTheme ? previewTheme.greeting : (live?.message ?? "");
  const seenKey = previewTheme ? `preview:${previewTheme.id}` : live ? `${live.id}:${live.startsOn}` : "";

  const reduced = React.useMemo(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(prefers-reduced-motion: reduce)").matches || Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)),
    [],
  );

  // Particles: start and stop with the theme, never throw into React.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!theme || !effects.particles || reduced || !canvas) return;
    try {
      return startParticles(canvas, { effect: theme.effect, colors: theme.colors, intensity });
    } catch {
      return;
    }
  }, [theme, effects.particles, intensity, reduced]);

  // Optional tint of the highlight colour (never the brand primary, so contrast is untouched).
  React.useEffect(() => {
    if (!theme || !effects.recolor) return;
    const root = document.documentElement;
    const prev = [root.style.getPropertyValue("--accent"), root.style.getPropertyValue("--accent-soft")];
    root.style.setProperty("--accent", theme.colors[0]);
    root.style.setProperty("--accent-soft", `${theme.colors[0]}24`);
    root.dataset.festival = theme.id;
    return () => {
      root.style.setProperty("--accent", prev[0]);
      root.style.setProperty("--accent-soft", prev[1]);
      if (!prev[0]) root.style.removeProperty("--accent");
      if (!prev[1]) root.style.removeProperty("--accent-soft");
      delete root.dataset.festival;
    };
  }, [theme, effects.recolor]);

  // Greeting: once per festival window per browser (always for a preview), then it leaves on its own.
  const [greeting, setGreeting] = React.useState(false);
  React.useEffect(() => {
    setGreetingGone(false);
    if (!theme || !effects.greeting || !message || !seenKey) {
      setGreeting(false);
      return;
    }
    const seen = safe(() => window.localStorage.getItem(SEEN_KEY), null);
    if (!previewTheme && seen === seenKey) return;
    setGreeting(true);
    if (!previewTheme) safe(() => window.localStorage.setItem(SEEN_KEY, seenKey), undefined);
    const t = window.setTimeout(() => setGreetingGone(true), GREETING_MS);
    return () => window.clearTimeout(t);
  }, [theme, effects.greeting, message, seenKey, previewTheme]);

  if (!theme) return null;
  const gradient = `linear-gradient(90deg, ${[...theme.colors, theme.colors[0]].join(", ")})`;

  return (
    <>
      {effects.glow && (
        <>
          <div aria-hidden className="mps-festival-wash" style={{ background: `radial-gradient(120% 100% at 50% 0%, ${theme.colors[0]}38, transparent 70%)` }} />
          <div aria-hidden className="mps-festival-ribbon" style={{ background: gradient }} />
        </>
      )}
      {effects.particles && !reduced && <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[40]" />}
      {greeting && !greetingGone && (
        <div role="status" className="mps-festival-greeting pointer-events-auto">
          <span aria-hidden className="text-[18px] leading-none">{theme.emoji}</span>
          <span className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug">{message}</span>
          {previewTheme ? (
            <button type="button" onClick={() => setFestivalPreview(null)} className="mps-festival-greeting__btn">
              End preview
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                safe(() => window.localStorage.setItem(OFF_KEY, "1"), undefined);
                setOff(true);
              }}
              className="mps-festival-greeting__btn"
            >
              Turn off
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => setGreetingGone(true)} className="mps-festival-greeting__x">
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
      {previewTheme && greetingGone && (
        <button type="button" onClick={() => setFestivalPreview(null)} className="mps-festival-previewchip">
          Previewing {previewTheme.name} · End
        </button>
      )}
    </>
  );
}
