/**
 * Generates local, on-brand SVG assets so the app ships real imagery instead of
 * random-placeholder network images (picsum / pravatar). Deterministic output.
 *
 *   node scripts/gen-assets.mjs
 *
 * Emits:
 *   public/media/cover-01..12.svg   — abstract branded cover art for media assets
 *   public/illustrations/*.svg      — spot illustrations for marketing
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MEDIA = join(ROOT, "public", "media");
const ILLO = join(ROOT, "public", "illustrations");
mkdirSync(MEDIA, { recursive: true });
mkdirSync(ILLO, { recursive: true });

// Brand palette (matches globals.css tokens).
const PAIRS = [
  ["#7c3aed", "#ec4899"],
  ["#6d28d9", "#a855f7"],
  ["#ec4899", "#f59e0b"],
  ["#3b82f6", "#7c3aed"],
  ["#10b981", "#3b82f6"],
  ["#f59e0b", "#ec4899"],
];

const shape = (i, a, b) => {
  const variants = [
    `<circle cx="360" cy="220" r="240" fill="url(#g)"/><circle cx="140" cy="560" r="160" fill="${b}" opacity="0.35"/>`,
    `<rect x="120" y="120" width="440" height="440" rx="64" fill="url(#g)" transform="rotate(12 340 340)"/>`,
    `<path d="M0 400 Q 270 180 540 400 T 1080 400 V 720 H 0 Z" fill="url(#g)"/><circle cx="420" cy="230" r="90" fill="${a}" opacity="0.5"/>`,
    `<polygon points="340,80 620,520 60,520" fill="url(#g)"/><circle cx="340" cy="360" r="70" fill="#fff" opacity="0.14"/>`,
    `<circle cx="340" cy="340" r="230" fill="none" stroke="url(#g)" stroke-width="72"/><circle cx="340" cy="340" r="70" fill="${b}"/>`,
    `<rect width="680" height="680" fill="url(#g)"/><g stroke="#fff" stroke-width="6" opacity="0.18"><path d="M0 170 H680 M0 340 H680 M0 510 H680 M170 0 V680 M340 0 V680 M510 0 V680"/></g>`,
  ];
  return variants[i % variants.length];
};

for (let i = 0; i < 12; i++) {
  const [a, b] = PAIRS[i % PAIRS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="680" viewBox="0 0 680 680" role="img" aria-label="Abstract cover art">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="680" height="680" fill="#faf7ff"/>
${shape(i, a, b)}
</svg>`;
  writeFileSync(join(MEDIA, `cover-${String(i + 1).padStart(2, "0")}.svg`), svg);
}

// --- marketing spot illustration: person holding a phone showing Cadence ---
writeFileSync(
  join(ILLO, "creator-phone.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="A creator holding a phone running Cadence">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2ebff"/><stop offset="1" stop-color="#ffd9ec"/></linearGradient>
<linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#ec4899"/></linearGradient>
</defs>
<rect width="800" height="600" rx="28" fill="url(#bg)"/>
<circle cx="620" cy="130" r="70" fill="#fff" opacity="0.5"/>
<circle cx="150" cy="470" r="90" fill="#fff" opacity="0.4"/>
<g transform="translate(250 90)">
  <rect x="0" y="0" width="300" height="440" rx="40" fill="#1b1230"/>
  <rect x="16" y="18" width="268" height="404" rx="26" fill="url(#screen)"/>
  <rect x="40" y="60" width="150" height="18" rx="9" fill="#fff" opacity="0.9"/>
  <rect x="40" y="92" width="210" height="12" rx="6" fill="#fff" opacity="0.55"/>
  <rect x="40" y="140" width="220" height="90" rx="16" fill="#fff" opacity="0.16"/>
  <rect x="40" y="248" width="220" height="90" rx="16" fill="#fff" opacity="0.16"/>
  <circle cx="150" cy="392" r="16" fill="#fff" opacity="0.9"/>
</g>
<g fill="none" stroke="#7c3aed" stroke-width="8" stroke-linecap="round" opacity="0.8">
  <path d="M120 150 l30 -18 M118 190 l34 4 M150 108 l18 -30"/>
</g>
</svg>`,
);

console.log("assets written:", "12 covers ->", MEDIA, "| illustrations ->", ILLO);
