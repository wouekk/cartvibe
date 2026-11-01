// Serves the built demo the way GitHub Pages will: static files under /demo/, nothing else, no rewrites.
//
//   node tools/serve-demo.cjs [directory] [port]
//
// Defaults: dist/cartvibe-demo/browser on port 4300 (or DEMO_PORT). Used by playwright.demo.config.ts.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MOUNT = "/demo/";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const root = path.resolve(process.argv[2] ?? path.join(__dirname, "..", "dist", "cartvibe-demo", "browser"));
const port = Number(process.argv[3] ?? process.env.DEMO_PORT ?? 4300);

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith(MOUNT)) {
      res.writeHead(404).end("Not found");
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(MOUNT.length)) || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("Not found");
      return;
    }

    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`Demo on http://localhost:${port}${MOUNT}`));
