// Regenerates src/assets/shots/*.webp from the built demo (the real app on its sample household), phone and desktop,
// day and night. Not run in CI.
//
//   cd desktop && npm run build:demo && node tools/serve-demo.cjs     (serves http://localhost:4300/demo/)
//   cd site && npm run shots                                          (E2E_CHROMIUM_PATH=<browser> if Playwright has none)
//
// Playwright is borrowed from ../desktop (the site does not install it). Environment: DEMO_URL (default above),
// SHOTS_ONLY (a name such as "dashboard" or "dashboard-phone-dark", to redo one). The demo's own "Demo, nothing is saved"
// strip is hidden: it is page chrome, not the app. Only the demo's made-up household is ever on screen.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "..", "..", "desktop", "package.json"));
const { chromium } = require("@playwright/test");

const demo = (process.env.DEMO_URL ?? "http://localhost:4300/demo/").replace(/\/?$/, "/");
const out = join(here, "..", "src", "assets", "shots");
const only = process.env.SHOTS_ONLY;
mkdirSync(out, { recursive: true });

// Output sizes: desktop 1440 px captured at 2x, written 2000 wide, so a 2x screen is not shown an upscaled picture; phone
// 390 px at 2x, written 520 wide. `crop` keeps the
// top part of a short page (in captured CSS px) so the frame hugs the content.
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, scale: 2, outWidth: 2000, mobile: false },
  phone: { width: 390, height: 844, scale: 2, outWidth: 520, mobile: true },
};

const scrollTo = (text) => async (page) => {
  await page.getByText(text, { exact: false }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
};

const PAGES = [
  { name: "dashboard", hash: "/overview/group/1", ready: "overview-donut" },
  { name: "charts", hash: "/overview/group/1", ready: "overview-donut", prepare: scrollTo("Spending by category") },
  { name: "shopping", hash: "/shopping-lists/group/1", ready: "shopping-list-item-name" },
  { name: "receipts", hash: "/receipts/group/1" },
  { name: "lines", hash: "/receipts/1/view", prepare: scrollTo("Products") },
  { name: "warranties", hash: "/warranties/group/1", crop: { desktop: 400, phone: 380 } },
  { name: "reports", hash: "/reports", crop: { desktop: 470, phone: 580 } },
  {
    name: "check",
    hash: "/overview/group/1",
    ready: "overview-scan-product",
    prepare: async (page) => {
      await page.getByTestId("overview-scan-product").click();
      await page.getByRole("dialog").waitFor();
    },
  },
];

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH || undefined });
let written = 0;
for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  for (const mode of ["light", "dark"]) {
    const todo = PAGES.filter((p) => !only || only === p.name || only === `${p.name}-${vpName}-${mode}`);
    if (todo.length === 0) continue;
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      colorScheme: mode,
      locale: "en-US", // the site is in English, so are its screenshots
      reducedMotion: "reduce",
    });
    // The demo reads its look under its own storage prefix (desktop/docs/demo.md).
    await context.addInitScript((m) => {
      try {
        localStorage.setItem("cartvibe-demo:cartvibe.themeMode", m);
        localStorage.setItem("cartvibe-demo:cartvibe.themePalette", "zinc");
      } catch {}
    }, mode);
    const page = await context.newPage();
    for (const p of todo) {
      await page.goto(demo);
      await page.getByTestId("demo-banner").waitFor();
      await page.addStyleTag({ content: '[data-testid="demo-banner"]{display:none!important}' });
      await page.evaluate((hash) => (window.location.hash = hash), p.hash);
      if (p.ready) await page.getByTestId(p.ready).first().waitFor();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1200);
      if (p.prepare) {
        await p.prepare(page);
        await page.waitForTimeout(800);
      }
      const png = await page.screenshot({ type: "png" });
      let image = sharp(png);
      const meta = await image.metadata();
      const keep = p.crop?.[vpName] ? Math.min(meta.height, p.crop[vpName] * vp.scale) : meta.height;
      image = image.extract({ left: 0, top: 0, width: meta.width, height: keep });
      const file = `${p.name}-${vpName}-${mode}.webp`;
      const info = await image.resize({ width: vp.outWidth }).webp({ quality: 80, effort: 6 }).toFile(join(out, file));
      console.log(`${file} ${info.width}x${info.height} ${Math.round(info.size / 1024)} kB`);
      written++;
    }
    await context.close();
  }
}
await browser.close();
if (written === 0) {
  console.error(`Nothing matched SHOTS_ONLY=${only}`);
  process.exit(1);
}
