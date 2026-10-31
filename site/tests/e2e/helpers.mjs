// Shared by the browser tests: a static server for the built site (site/dist, mounted at /cartvibe/ like GitHub Pages)
// and Playwright, which the site does not install itself: it is borrowed from ../desktop (the same way tools/shots.mjs
// does). Build first (`npm run build`), then `npm run test:e2e`. E2E_CHROMIUM_PATH points at an installed Chromium.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const dist = resolve(here, "..", "..", "dist");
const require = createRequire(join(here, "..", "..", "..", "desktop", "package.json"));
export const { chromium } = require("@playwright/test");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

export function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/cartvibe/")) return void res.writeHead(404).end("Not found");
    let file = resolve(dist, decodeURIComponent(url.pathname.slice("/cartvibe/".length)));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!file.startsWith(dist + sep) || !existsSync(file)) return void res.writeHead(404).end("Not found");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => ok({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })),
  );
}

export function launch() {
  return chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH || undefined });
}

export const PALETTES = ["zinc", "blue", "indigo", "emerald", "violet"];

/** Opens a page with the palette and mode set the way the site stores them (localStorage, no cookie). */
export async function open(browser, origin, path, { palette = "zinc", mode = "light", width = 1280, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: mode });
  await context.addInitScript(
    ([p, m]) => {
      try {
        localStorage.setItem("cartvibe-site-palette", p);
        localStorage.setItem("cartvibe-site-mode", m);
      } catch {}
    },
    [palette, mode],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const messages = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") messages.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));
  await page.goto(`${origin}/cartvibe${path}`);
  return { page, context, messages };
}
