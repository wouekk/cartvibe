#!/usr/bin/env node
/*
  Adds spartan/ui "helm" components to src/ui, the way the official CLI does, without needing an Nx workspace.

    node tools/spartan-add.cjs autocomplete tabs table

  It downloads @spartan-ng/cli (the same package the official generator ships in), reads the component templates for
  each requested primitive and its dependencies (utils, button, ...), fills in the import alias (@spartan-ng/helm),
  and replaces every `spartan-*` style token with the Tailwind classes of the chosen style (vega), exactly as the
  generator's style transform does. The result is plain source in src/ui/<name>, ours to maintain.

  The brain primitives (behaviour) come from the @spartan-ng/brain package, pinned in package.json.
*/
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const CLI_VERSION = "1.8.0";
const STYLE = "vega";
const ALIAS = "@spartan-ng/helm";
const projectRoot = path.resolve(__dirname, "..");
const outRoot = path.join(projectRoot, "src", "ui");

const requested = process.argv.slice(2);
if (requested.length === 0) {
  console.error("usage: node tools/spartan-add.cjs <primitive> [<primitive> ...]");
  process.exit(2);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "spartan-cli-"));
execSync(`npm pack @spartan-ng/cli@${CLI_VERSION} --silent`, { cwd: work, stdio: "pipe" });
execSync(`tar -xzf spartan-ng-cli-${CLI_VERSION}.tgz`, { cwd: work, stdio: "pipe" });
const gen = path.join(work, "package", "src", "generators", "ui");

const postcss = require(path.join(projectRoot, "node_modules", "postcss"));

function createStyleMap(css) {
  const result = {};
  postcss.parse(css).walkRules((rule) => {
    const classes = [];
    for (const node of rule.nodes || []) if (node.type === "atrule" && node.name === "apply") classes.push(node.params.trim());
    if (!classes.length) return;
    const tw = classes.join(" ");
    for (const selector of rule.selectors || []) {
      const matches = selector.replace(/\s*&\s*/g, "").match(/\.spartan-[a-z0-9-]+/g);
      if (!matches) continue;
      const className = matches[matches.length - 1].slice(1);
      result[className] = result[className] ? `${tw} ${result[className]}` : tw;
    }
  });
  return result;
}

const styleMap = createStyleMap(fs.readFileSync(path.join(gen, `style-${STYLE}.css`), "utf8"));
const deps = require(path.join(gen, "primitive-deps.js")).primitiveDependencies;

function expand(name, seen = new Set()) {
  if (seen.has(name)) return seen;
  seen.add(name);
  for (const d of deps[name] || []) expand(d, seen);
  return seen;
}
const all = new Set();
for (const r of requested) expand(r, all);

function transform(source) {
  const out = source.replace(/<%-\s*importAlias\s*%>/g, ALIAS);
  // Style tokens only: not the @spartan-ng package scope, and not inside attribute names such as data-[matches-spartan-invalid=true].
  return out.replace(/(?<![@\w-])spartan-(?!ng\b)[a-z0-9-]+/g, (token) => (token in styleMap ? styleMap[token].replace(/'/g, "\\'") : ""));
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    if (entry.isDirectory()) { copyDir(src, path.join(to, entry.name)); continue; }
    if (!entry.name.endsWith(".template")) continue;
    const dest = path.join(to, entry.name.replace(/\.template$/, ""));
    fs.writeFileSync(dest, transform(fs.readFileSync(src, "utf8")));
  }
}

for (const name of all) {
  const from = path.join(gen, "libs", name, "files");
  if (!fs.existsSync(from)) { console.error(`unknown primitive: ${name}`); process.exit(1); }
  copyDir(from, path.join(outRoot, name));
  console.log("added", name);
}
fs.rmSync(work, { recursive: true, force: true });
