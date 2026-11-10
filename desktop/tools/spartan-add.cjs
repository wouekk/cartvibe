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

// Local patches, re-applied after every generation. Tailwind 4.3 compiles `data-active:` to the attribute's presence
// ([data-active]), but the sidebar helm binds the boolean (`data-active="false"` is still present), which made every menu
// button look active. A false value has to remove the attribute.
// The storage methods patched into the sidebar service (see the sidebar entries at the end of `patches`).
const SIDEBAR_STORAGE = "\t// CartVibe: the open state lives in localStorage, never in a cookie (the project site and the demo set no cookies).\n\t// Patched in by tools/spartan-add.cjs.\n\tprivate static readonly _storageKey = 'cartvibe.sidebarOpen';\n\n\tprivate saveState(open: boolean): void {\n\t\ttry {\n\t\t\tthis._window?.localStorage.setItem(HlmSidebarService._storageKey, String(open));\n\t\t} catch {\n\t\t\t// Storage blocked: the sidebar still toggles, it is just not remembered.\n\t\t}\n\t}\n\n\tprivate restoreState(): void {\n\t\tlet stored: string | null = null;\n\t\ttry {\n\t\t\tstored = this._window?.localStorage.getItem(HlmSidebarService._storageKey) ?? null;\n\t\t} catch {\n\t\t\treturn;\n\t\t}\n\t\tif (stored !== null) {\n\t\t\tthis._open.set(stored === 'true');\n\t\t\treturn;\n\t\t}\n\t\t// A sidebar_state cookie from an older version: keep its choice once, then delete the cookie.\n\t\tif (isPlatformServer(this._platformId)) return;\n\t\tthis.restoreStateFromCookie();\n\t\tif (this._document.cookie.includes(`${this._config.sidebarCookieName}=`)) {\n\t\t\tthis.saveState(this._open());\n\t\t\tthis._document.cookie = `${this._config.sidebarCookieName}=; path=/; max-age=0`;\n\t\t}\n\t}\n\n\tprivate restoreStateFromCookie(): void {";

const patches = [
  ["sidebar/lib/hlm-sidebar-menu-button.ts", "'[attr.data-active]': 'isActive()',", "'[attr.data-active]': 'isActive() ? \"\" : null',"],
  ["sidebar/lib/hlm-sidebar-menu-sub-button.ts", "'[attr.data-active]': 'isActive()',", "'[attr.data-active]': 'isActive() ? \"\" : null',"],
  ["button/lib/hlm-button.ts", "whitespace-nowrap transition-all outline-none", "whitespace-nowrap transition-all duration-150 active:scale-[0.98] outline-none"],
  // One control height for buttons, inputs, selects and tab strips: 36px under a mouse, 44px under a finger
  // (`--control-h` in tailwind.css), instead of the helm's fixed h-9 / size-9.
  ...["button/lib/hlm-button.ts", "input/lib/hlm-input.ts", "input-group/lib/hlm-input-group.ts", "select/lib/hlm-select-trigger.ts", "tabs/lib/hlm-tabs-list.ts"].map(
    (file) => [file, /(?<![A-Za-z0-9-])(h|size)-9(?![\w./-])/g, (_match, kind) => `${kind}-control`],
  ),
  ["collapsible/lib/hlm-collapsible-content.ts", "classes(() => 'data-[state=closed]:hidden');", 'classes(() => "data-[state=closed]:hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200");'],
  // brn-switch marks its state as data-state="checked|unchecked", never a data-checked attribute, so the helm's
  // `data-checked:` classes never applied and a switch that was on looked off.
  ["switch/lib/hlm-switch.ts", /data-(un)?checked:/g, (_match, un) => `data-[state=${un ? "unchecked" : "checked"}]:`],
  ["switch/lib/hlm-switch-thumb.ts", /data-(un)?checked:/g, (_match, un) => `data-[state=${un ? "unchecked" : "checked"}]:`],
  // brn-checkbox has the same data-state="checked" and no data-checked, so a ticked checkbox never filled.
  ["checkbox/lib/hlm-checkbox.ts", /data-checked:/g, () => "data-[state=checked]:"],
  // brn-checkbox labels itself through the id of its enclosing <label>, derived from its own id; with no id every
  // checkbox's label got "null-label" and all of them were named after the first one. An unset id gets a unique one.
  ["checkbox/lib/hlm-checkbox.ts", '[id]="inputId()"', '[id]="inputId() ?? _autoId"'],
  ["checkbox/lib/hlm-checkbox.ts", "public readonly inputId = input<string | null>(null);", "public readonly inputId = input<string | null>(null);\n\n\tprotected readonly _autoId = `hlm-checkbox-${HlmCheckbox._nextId++}`;\n\tprivate static _nextId = 0;"],
  // brn-tabs-trigger marks the selected tab as data-state="active", never a data-active attribute, so no tab strip
  // (period picker, settings tabs, Records / Aggregate, the welcome's choices) showed which tab was selected.
  ["tabs/lib/hlm-tabs-trigger.ts", /data-active:/g, () => "data-[state=active]:"],
  // A tip is a small popover like the menus (popover surface, hairline), not an inverted black box in the day palette:
  // no arrow, since a bordered arrow would break the hairline.
  ["tooltip/lib/hlm-tooltip.ts", /bg-foreground text-background/g, () => "bg-popover text-popover-foreground border border-border"],
  ["tooltip/lib/hlm-tooltip.ts", "'bg-foreground fill-foreground z-50 block", "'hidden z-50"],
  // A disabled control is dimmed and takes no pointer, with no not-allowed cursor (DESIGN.md, Patterns → Disabled).
  ...["select/lib/hlm-select-trigger.ts", "checkbox/lib/hlm-checkbox.ts", "switch/lib/hlm-switch.ts", "radio-group/lib/hlm-radio.ts", "textarea/lib/hlm-textarea.ts"].map(
    (file) => [file, /(disabled:|data-disabled:|data-\[disabled=true\]:)cursor-not-allowed/g, (_match, variant) => `${variant}pointer-events-none`],
  ),
  // The sidebar remembers open/closed in a 7-day `sidebar_state` cookie on path /; the project site and the demo
  // (same origin) promise no cookies. It goes to localStorage instead; an old cookie is read once and deleted.
  ["sidebar/lib/hlm-sidebar.service.ts", /(inject\(DestroyRef\);\s+)this\.restoreStateFromCookie\(\);/, (_match, before) => `${before}this.restoreState();`],
  [
    "sidebar/lib/hlm-sidebar.service.ts",
    "this._document.cookie = `${this._config.sidebarCookieName}=${open}; path=/; max-age=${this._config.sidebarCookieMaxAge}`;",
    () => "this.saveState(open);",
  ],
  ["sidebar/lib/hlm-sidebar.service.ts", "\tprivate restoreStateFromCookie(): void {", () => SIDEBAR_STORAGE],
];
for (const [file, from, to] of patches) {
  const target = path.join(outRoot, file);
  if (!fs.existsSync(target)) continue;
  const text = fs.readFileSync(target, "utf8");
  const found = from instanceof RegExp ? new RegExp(from.source).test(text) : text.includes(from);
  if (found) fs.writeFileSync(target, text.replace(from, to));
}
