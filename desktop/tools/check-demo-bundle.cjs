// Proves the demo is compiled out of the real app.
//
//   node tools/check-demo-bundle.cjs [production dir] [demo dir]
//
// Defaults: dist/cartvibe/browser (the production build) and dist/cartvibe-demo/browser (the `demo` build). Run it after
// `ng build` and `ng build --configuration demo`. It fails when
//   1. any JavaScript file of the production build contains a demo marker (the demo's backend, sample data or banner
//      reached the real app), or
//   2. the demo build is missing one (the check would pass for the wrong reason: the markers no longer exist).
// The markers are strings, not class names, because a minifier renames classes but never string literals. Only .js files
// are read: the translation JSON legitimately carries the banner text in every build.
const fs = require("node:fs");
const path = require("node:path");

const MARKERS = [
  "cartvibe-demo:", // the demo's storage prefix (demo-storage.ts)
  "Demo, nothing is saved", // the banner (demo-banner.component.ts)
  "Upstream credits in", // the footer (demo-footer.component.ts)
  "Greenfield Market", // the sample household (backend/seed.ts)
  "Corner Bakery", // the scripted scan (backend/scripted-scan.ts)
  "Sample receipt, drawn by the demo", // the drawn receipt picture (backend/receipt-image.ts)
  "is not part of the demo", // the backend's answer to an unknown endpoint (backend/router.ts)
];

function javascriptFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? javascriptFiles(full) : entry.name.endsWith(".js") ? [full] : [];
    });
}

function markersIn(dir) {
  const files = javascriptFiles(dir);
  if (files.length === 0) {
    throw new Error(`No JavaScript found in ${dir}; build it first.`);
  }

  const found = new Map();
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const marker of MARKERS) {
      if (text.includes(marker)) {
        found.set(marker, [...(found.get(marker) ?? []), path.relative(dir, file)]);
      }
    }
  }
  return found;
}

module.exports = { MARKERS, markersIn };

if (require.main === module) {
  const root = path.join(__dirname, "..", "dist");
  const productionDir = process.argv[2] ?? path.join(root, "cartvibe", "browser");
  const demoDir = process.argv[3] ?? path.join(root, "cartvibe-demo", "browser");
  let failed = false;

  const leaked = markersIn(productionDir);
  for (const [marker, files] of leaked) {
    console.error(`Demo marker "${marker}" is in the production build: ${files.join(", ")}`);
    failed = true;
  }

  const inDemo = markersIn(demoDir);
  for (const marker of MARKERS.filter((candidate) => !inDemo.has(candidate))) {
    console.error(`Demo marker "${marker}" is not in the demo build: the check cannot prove anything. Update MARKERS.`);
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }
  console.log(`Demo bundle check passed: none of ${MARKERS.length} markers in the production build, all in the demo build.`);
}
