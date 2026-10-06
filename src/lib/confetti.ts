/**
 * Tiny dependency-free confetti burst for genuine milestones (first publish,
 * successful payment) — not for routine saves. Draws on a temporary full-screen
 * canvas, then removes it. No-ops on the server, for reduced-motion users and
 * on low-power conditions (hidden tab).
 */

const COLORS = ["#F0762E", "#feb804", "#ffd9a0", "#ffffff", "#ff9d5c"];

type Piece = { x: number; y: number; vx: number; vy: number; size: number; rot: number; vr: number; color: string; life: number };

export function fireConfetti(opts: { count?: number; originY?: number } = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (document.hidden) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const count = opts.count ?? (window.innerWidth < 640 ? 60 : 110);
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "9999" });
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const originX = window.innerWidth / 2;
  const originY = window.innerHeight * (opts.originY ?? 0.35);
  const pieces: Piece[] = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 6 + Math.random() * 8;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 1,
    };
  });

  let frame = 0;
  const maxFrames = 110;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of pieces) {
      p.vy += 0.28;
      p.vx *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - frame / maxFrames);
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (frame < maxFrames && !document.hidden) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
