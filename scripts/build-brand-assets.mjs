/**
 * Builds every web-sized brand asset from the master files in public/media.
 *
 *   npm run brand:assets
 *
 * The masters (public/media/*.png, 1 to 1.5 MB each) are the source of truth and are never modified.
 * The app serves small derivatives instead, so a page doesn't download megabytes of logo:
 *
 *   public/brand/        header, footer and sidebar logos (webp), the 512px logo for structured data,
 *                        and the 1200x630 link-preview image
 *   src/app/icon.png     browser-tab icon          (Next serves it at /icon.png, content-hashed)
 *   src/app/apple-icon.png                          iOS home-screen icon
 *   public/icons/        installed-app (PWA) icons: any-purpose 192/512 and maskable 512
 *
 * Re-run it whenever a master changes.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const media = (f) => path.join(root, "public/media", f);
const out = (...p) => path.join(root, ...p);

await mkdir(out("public/brand"), { recursive: true });
await mkdir(out("public/icons"), { recursive: true });

/* ---- the app-icon tile inside Favicon.png (a dark rounded square on black) ---- */
const FAV = media("Favicon.png");
const { data, info } = await sharp(FAV).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let x0 = info.width, x1 = 0, y0 = info.height, y1 = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3;
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 > 14) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
}
const side = Math.min(x1 - x0 + 1, y1 - y0 + 1);
const cx = Math.round((x0 + x1) / 2);
const cy = Math.round((y0 + y1) / 2);
const crop = (size) => ({ left: Math.max(0, cx - Math.round(size / 2)), top: Math.max(0, cy - Math.round(size / 2)), width: size, height: size });

/** The tile as a square image of `px`, optionally with transparent rounded corners. */
async function tile(px, { rounded, inset = 1 }) {
  const size = Math.round(side * inset);
  let img = sharp(FAV).extract(crop(size)).resize(px, px, { fit: "cover" });
  if (rounded) {
    const r = Math.round(px * 0.225);
    const mask = Buffer.from(`<svg width="${px}" height="${px}"><rect width="${px}" height="${px}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
    img = img.ensureAlpha().composite([{ input: mask, blend: "dest-in" }]);
  }
  return img.png({ compressionLevel: 9 });
}

/* ---- icons ---- */
await (await tile(256, { rounded: true })).toFile(out("src/app/icon.png"));
// iOS rounds the corners itself and wants an opaque square: crop in a little so no black corner shows.
await (await tile(180, { rounded: false, inset: 0.9 })).toFile(out("src/app/apple-icon.png"));
await (await tile(192, { rounded: true })).toFile(out("public/icons/icon-192.png"));
await (await tile(512, { rounded: true })).toFile(out("public/icons/icon-512.png"));
// Maskable: Android may crop to a circle, so the mark has to sit inside the central 80%. Shrink the tile onto a black canvas.
{
  const inner = await (await tile(400, { rounded: true })).toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 3, background: "#050304" } })
    .composite([{ input: inner, left: 56, top: 56 }])
    .png({ compressionLevel: 9 })
    .toFile(out("public/icons/icon-maskable-512.png"));
}

/* ---- logos (webp, sized for retina at the heights the UI uses) ---- */
// Names follow the background they are drawn for: logo_white / logo-light are for light surfaces, logo-dark for dark ones.
await sharp(media("Logo_white.png")).resize({ height: 240 }).webp({ quality: 88 }).toFile(out("public/brand/wordmark-light.webp"));
await sharp(media("logo-dark.png")).resize({ height: 240 }).webp({ quality: 88 }).toFile(out("public/brand/wordmark-dark.webp"));
await sharp(media("logo-light.png")).resize(512, 512).webp({ quality: 88 }).toFile(out("public/brand/logo-stacked.webp"));
await (await tile(160, { rounded: true })).toFormat("webp", { quality: 90 }).toFile(out("public/brand/mark.webp"));
// Structured data and email want a PNG.
await sharp(media("logo-light.png")).resize(512, 512).png({ compressionLevel: 9 }).toFile(out("public/brand/logo-512.png"));

/* ---- link-preview image: the stacked logo centred on its own background colour ---- */
{
  const logo = sharp(media("logo-light.png"));
  const { data: px, info: i2 } = await logo.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = { r: px[0], g: px[1], b: px[2] }; // the image's own corner colour
  const h = 630;
  const body = await sharp(media("logo-light.png")).resize(h, h).png().toBuffer();
  await sharp({ create: { width: 1200, height: h, channels: 3, background: bg } })
    .composite([{ input: body, left: Math.round((1200 - h) / 2), top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(out("public/brand/og-image.png"));
  void i2;
}

console.log(`brand assets built (tile ${side}px at ${x0},${y0})`);
