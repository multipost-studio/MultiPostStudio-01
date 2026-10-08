import type { EffectKind, Intensity } from "@/lib/festivals/types";

/**
 * A small canvas particle engine for festival effects. One rAF loop, a capped
 * particle count (halved on narrow screens), device pixel ratio capped at 2, and
 * the loop sleeps while the tab is hidden. Nothing here touches React or the DOM
 * beyond the canvas it is handed, and `start` returns a function that stops it.
 */

type Kind = "ambient" | "rocket" | "spark" | "puff";
type P = {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  age: number;
  life: number;
  phase: number;
  glyph?: string;
  ty?: number;
};

const COUNT: Record<Intensity, number> = { low: 16, medium: 30, high: 52 };
const BURST_EVERY_S: Record<Intensity, number> = { low: 2.6, medium: 1.7, high: 1.1 };
const FALLING = new Set<EffectKind>(["confetti", "snow", "petals", "leaves", "spooky"]);
const RISING = new Set<EffectKind>(["embers", "hearts", "lanterns"]);
const GLYPHS: Partial<Record<EffectKind, string[]>> = { leaves: ["🍂", "🍁"], spooky: ["🎃", "🦇", "👻"], lanterns: ["🏮"] };
const BURSTS = new Set<EffectKind>(["powder", "fireworks"]);

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export function startParticles(canvas: HTMLCanvasElement, opts: { effect: EffectKind; colors: string[]; intensity: Intensity }): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const { effect, colors, intensity } = opts;
  const parts: P[] = [];
  let w = 0;
  let h = 0;
  let raf = 0;
  let last = 0;
  let burstClock = 0;
  let stopped = false;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const ambientTarget = () => (BURSTS.has(effect) ? 0 : Math.round(COUNT[intensity] * Math.min(1, Math.max(0.5, w / 1100))));

  const spawnAmbient = (scatter: boolean) => {
    const falling = FALLING.has(effect);
    const rising = RISING.has(effect);
    const glyph = GLYPHS[effect] ? pick(GLYPHS[effect]!) : undefined;
    const size = glyph ? rnd(14, 24) : effect === "snow" ? rnd(1.6, 4.2) : effect === "embers" ? rnd(1.4, 3.4) : effect === "stars" ? rnd(5, 11) : rnd(5, 11);
    parts.push({
      kind: "ambient",
      x: rnd(0, w),
      y: scatter ? rnd(0, h) : falling ? -20 : rising ? h + 20 : rnd(0, h),
      vx: rnd(-14, 14),
      vy: falling ? rnd(45, 120) : rising ? -rnd(45, 130) : 0,
      size,
      rot: rnd(0, Math.PI * 2),
      vr: rnd(-2.2, 2.2),
      color: pick(colors),
      age: scatter ? rnd(0, 4) : 0,
      life: effect === "stars" ? rnd(2.4, 5) : 99,
      phase: rnd(0, Math.PI * 2),
      glyph,
    });
  };

  const burst = () => {
    if (effect === "powder") {
      const x = rnd(w * 0.1, w * 0.9);
      const y = rnd(h * 0.12, h * 0.6);
      const color = pick(colors);
      parts.push({ kind: "puff", x, y, vx: 0, vy: 0, size: rnd(60, 110), rot: 0, vr: 0, color, age: 0, life: 1.7, phase: 0 });
      for (let i = 0; i < 12; i++) {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(40, 150);
        parts.push({ kind: "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: rnd(2, 4.5), rot: 0, vr: 0, color, age: 0, life: rnd(0.9, 1.5), phase: 0 });
      }
    } else {
      parts.push({ kind: "rocket", x: rnd(w * 0.15, w * 0.85), y: h + 10, vx: rnd(-18, 18), vy: -rnd(380, 520), size: 2.4, rot: 0, vr: 0, color: pick(colors), age: 0, life: 3, phase: 0, ty: rnd(h * 0.12, h * 0.5) });
    }
  };

  const explode = (r: P) => {
    const n = 26;
    const base = rnd(0, Math.PI);
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * Math.PI * 2;
      const s = rnd(70, 190);
      parts.push({ kind: "spark", x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: rnd(1.6, 3), rot: 0, vr: 0, color: Math.random() < 0.7 ? r.color : pick(colors), age: 0, life: rnd(1.1, 1.8), phase: 0 });
    }
  };

  const step = (dt: number) => {
    for (const p of parts) {
      p.age += dt;
      if (p.kind === "ambient") {
        if (FALLING.has(effect)) {
          p.y += p.vy * dt;
          p.x += (p.vx + Math.sin(p.phase + p.age * 1.6) * 26) * dt;
          p.rot += p.vr * dt;
          if (p.y > h + 30) p.age = p.life + 1;
        } else if (RISING.has(effect)) {
          p.y += p.vy * dt;
          p.x += Math.sin(p.phase + p.age * 1.3) * 22 * dt;
          p.rot += p.vr * dt * 0.3;
          if (p.y < -30) p.age = p.life + 1;
        }
      } else if (p.kind === "rocket") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy *= 0.985;
        if (p.y <= (p.ty ?? 0) || p.age > p.life) {
          explode(p);
          p.age = p.life + 1;
        }
      } else if (p.kind === "spark") {
        p.vy += 120 * dt;
        p.vx *= 0.992;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    // Compact in place: drop finished particles.
    let j = 0;
    let ambient = 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].age > parts[i].life) continue;
      if (parts[i].kind === "ambient") ambient++;
      parts[j++] = parts[i];
    }
    parts.length = j;

    for (let i = 0; i < Math.min(ambientTarget() - ambient, 2); i++) spawnAmbient(false);

    if (BURSTS.has(effect)) {
      burstClock += dt;
      if (burstClock >= BURST_EVERY_S[intensity]) {
        burstClock = 0;
        burst();
      }
    }
  };

  const heart = (x: number, y: number, s: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.5, y - s * 1.1, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 1.1, x + s, y - s * 0.4, x, y + s * 0.35);
    ctx.fill();
  };

  const sparkle = (x: number, y: number, s: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s, y);
    ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y);
    ctx.quadraticCurveTo(x, y, x, y - s);
    ctx.fill();
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      ctx.fillStyle = p.color;
      if (p.kind === "puff") {
        const t = p.age / p.life;
        ctx.globalAlpha = 0.4 * (1 - t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.25 + 0.75 * Math.min(1, t * 1.6)), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (p.kind === "spark" || p.kind === "rocket") {
        const t = p.kind === "spark" ? p.age / p.life : 0;
        ctx.globalAlpha = Math.max(0, 1 - t * t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === "spark" ? 1 - t * 0.5 : 1), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      // Ambient particle.
      if (p.glyph) {
        ctx.globalAlpha = 0.9;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(p.age * 1.4 + p.phase) * 0.35);
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.glyph, 0, 0);
        ctx.restore();
        continue;
      }
      const fade = RISING.has(effect) ? Math.max(0, Math.min(1, (p.y / h) * 1.6)) : 1;
      switch (effect) {
        case "snow":
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "confetti":
          ctx.globalAlpha = 0.9;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case "petals":
          ctx.globalAlpha = 0.85;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 0.9, p.size * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        case "embers":
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.9 * fade * (0.6 + 0.4 * Math.sin(p.age * 8 + p.phase));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha *= 0.35;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
          break;
        case "hearts":
          ctx.globalAlpha = 0.8 * fade;
          heart(p.x, p.y, p.size * 1.3);
          break;
        case "stars":
          ctx.globalAlpha = 0.9 * Math.sin((Math.PI * p.age) / p.life);
          sparkle(p.x, p.y, p.size);
          break;
      }
    }
    ctx.globalAlpha = 1;
  };

  const frame = (now: number) => {
    if (stopped) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  };

  const onVisibility = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !stopped) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  resize();
  for (let i = 0; i < ambientTarget(); i++) spawnAmbient(true);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibility);
  if (!document.hidden) raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVisibility);
    ctx.clearRect(0, 0, w, h);
  };
}
