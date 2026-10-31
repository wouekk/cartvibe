// Turns the raw PNG screenshots (tools/shots.cjs) into the WebP files the page uses.
//   node tools/make-images.mjs <folder with the PNGs>      (writes site/src/assets/shots/)
import { mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node tools/make-images.mjs <folder with the PNGs>");
  process.exit(1);
}
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "assets", "shots");
mkdirSync(out, { recursive: true });

// Short pages are cropped so the frame hugs the content (heights in source pixels).
const crop = {
  "warranties-desktop": 400,
  "reports-desktop": 470,
  "warranties-phone": 760,
  "reports-phone": 1160,
};
const names = ["dashboard", "charts", "shopping", "receipts", "lines", "warranties", "reports", "check"];

for (const name of names) {
  for (const vp of ["desktop", "phone"]) {
    for (const mode of ["light", "dark"]) {
      const file = readdirSync(input).find((f) => f === `${name}-${vp}-${mode}.png`);
      if (!file) continue;
      let image = sharp(join(input, file));
      const meta = await image.metadata();
      const height = Math.min(crop[`${name}-${vp}`] ?? meta.height, meta.height);
      image = image.extract({ left: 0, top: 0, width: meta.width, height });
      const info = await image
        .resize({ width: vp === "desktop" ? 1200 : 520 })
        .webp({ quality: 78, effort: 6 })
        .toFile(join(out, `${name}-${vp}-${mode}.webp`));
      console.log(`${name}-${vp}-${mode}.webp ${info.width}x${info.height} ${Math.round(info.size / 1024)} kB`);
    }
  }
}
