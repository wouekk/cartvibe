// Checks that every inline <script> in an index.html is allowed by the script-src hashes in the nginx config.
//
//   node tools/check-csp-hash.cjs [index.html] [default.conf]
//
// Defaults: the built dist/cartvibe/browser/index.html and ../docker/default.conf. CI runs it after `ng build`. The
// hash is taken over LF text, because git stores LF and the Docker image is built from a Linux checkout; a Windows
// checkout with CRLF line endings would otherwise give a hash the image never serves.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function inlineScriptHashes(html) {
  const hashes = [];
  const scripts = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = scripts.exec(html)) !== null) {
    const body = match[1].replace(/\r\n/g, "\n");
    hashes.push("sha256-" + crypto.createHash("sha256").update(body).digest("base64"));
  }
  return hashes;
}

function allowedHashes(conf) {
  return [...conf.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]);
}

module.exports = { inlineScriptHashes, allowedHashes };

if (require.main === module) {
  const indexPath = process.argv[2] ?? path.join(__dirname, "..", "dist", "cartvibe", "browser", "index.html");
  const confPath = process.argv[3] ?? path.join(__dirname, "..", "..", "docker", "default.conf");
  const needed = inlineScriptHashes(fs.readFileSync(indexPath, "utf8"));
  const allowed = allowedHashes(fs.readFileSync(confPath, "utf8"));
  const missing = needed.filter((hash) => !allowed.includes(hash));
  if (needed.length === 0) {
    console.error(`No inline script found in ${indexPath}; the check is looking at the wrong file.`);
    process.exit(1);
  }
  if (missing.length > 0) {
    console.error(`Not allowed by the script-src in ${confPath}: ${missing.join(", ")}`);
    console.error("Put the hash(es) above into the Content-Security-Policy header of docker/default.conf.");
    process.exit(1);
  }
  console.log(`CSP hash check: ${needed.length} inline script(s) allowed.`);
}
