"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

/**
 * A soft, slowly-drifting gradient orb for hero/section backgrounds.
 *
 * Canvas rather than animated SVG paths (cheaper, and no long hand-authored
 * path data). Three blobs orbit a shared centre and are heavily blurred into
 * one fluid shape. Colours come from the theme tokens, read once at mount, so
 * it matches light and dark without its own palette.
 *
 * Pauses when off-screen and when the tab is hidden; honours
 * prefers-reduced-motion by rendering a single still frame.
 */
export function FluidOrb({
  className,
  size = 520,
  /** 0–1; how strong the colour is over the page. */
  intensity = 0.5,
}: {
  className?: string;
  size?: number;
  intensity?: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Read the palette from the element's resolved styles so it tracks theme.
    const cs = getComputedStyle(canvas);
    const wine = cs.getPropertyValue("--primary").trim() || "#6F262C";
    const rose = cs.getPropertyValue("--rose").trim() || cs.getPropertyValue("--primary-soft").trim() || "#CC8B86";
    const blobs = [
      { color: wine, r: size * 0.34, speed: 0.00013, phase: 0 },
      { color: rose, r: size * 0.30, speed: 0.00019, phase: 2.1 },
      { color: wine, r: size * 0.26, speed: -0.00016, phase: 4.2 },
    ];

    ctx.globalAlpha = Math.max(0, Math.min(1, intensity));
    ctx.filter = `blur(${Math.round(size * 0.11)}px)`;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      for (const b of blobs) {
        const a = t * b.speed + b.phase;
        const x = cx + Math.cos(a) * size * 0.12;
        const y = cy + Math.sin(a * 1.3) * size * 0.12;
        const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
        g.addColorStop(0, b.color);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // Reduced motion or SSR-y environments: one frame, no loop.
    if (reduce) {
      draw(0);
      return;
    }

    let raf = 0;
    let running = true;
    const loop = (now: number) => {
      if (!running) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        const shouldRun = e.isIntersecting && !document.hidden;
        if (shouldRun && !raf) raf = requestAnimationFrame(loop);
        if (!shouldRun && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    const onVis = () => {
      if (document.hidden && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!document.hidden && !raf) {
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [size, intensity, reduce]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, pointerEvents: "none" }}
    />
  );
}
