// The traps the guides warn about, as checks: `npm run check:traps` (CI runs it before the specs). A guide is read
// by whoever remembers to; this fails the run.
//
//   node tools/check-traps.cjs            check
//   node tools/check-traps.cjs --update   write today's counts to tools/trap-baseline.json (after lowering one)
//
// 1. Nothing imports `environment.development`: angular.json swaps the file per configuration, and a direct
//    import once shipped the development settings (NGXS development mode, Redux DevTools) to production.
// 2. No `[attr.aria-label]` is glued together with `+`: such a label is never translated. Use `| t` with a
//    `{placeholder}`.
// 3. Two counts may only go down: components still `standalone: false`, and Material-era names (`matDialog`,
//    `matColumnDef`, ...) that outlived Material. tools/trap-baseline.json holds the counts; a lower count has to be
//    written there in the same change, so the number in the file is always the real one.
// 4. One version number: the release tag. package.json and the API contract stay at 0.0.0 so they cannot drift.
// 5. A template that uses `hlmBtn`, `hlmTooltip` or `hlmBadge` has the directive in its component's `imports`.
//    They are attributes on a plain element, so the compiler says nothing when the import is missing: the button
//    is simply unstyled, the tooltip never shows. A component, a pipe or a property binding without its import
//    is a build error; these three are not.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const src = path.join(root, "src");
const baselinePath = path.join(__dirname, "trap-baseline.json");
const update = process.argv.includes("--update");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const relative = (file) => path.relative(root, file).split(path.sep).join("/");

// The generated client is not ours to change; specs may name what they like.
const files = walk(src)
  .filter((file) => /\.(ts|html)$/.test(file))
  .filter((file) => !relative(file).startsWith("src/open-api/") && !file.endsWith(".spec.ts"))
  .map((file) => ({ name: relative(file), text: fs.readFileSync(file, "utf8") }));

const failures = [];

for (const file of files) {
  if (!file.name.startsWith("src/environments/") && /environments\/environment\.development/.test(file.text)) {
    failures.push(`${file.name}: imports environment.development; import "src/environments/environment" instead`);
  }

  file.text.split("\n").forEach((line, index) => {
    if (/\[attr\.aria-label\]="[^"]*\+[^"]*"/.test(line)) {
      failures.push(`${file.name}:${index + 1}: an aria-label glued with "+" is never translated; use | t with a {placeholder}`);
    }
  });
}

// 5. The helm attribute directives a template uses, against the component's own imports.
const HELM_ATTRIBUTES = [
  { used: /(?<![\w-])hlmBtn(?![\w-])/, directive: "HlmButton", bundle: "HlmButtonImports" },
  { used: /(?<![\w-])\[?hlmTooltip\]?(?=[\s=>])/, directive: "HlmTooltip", bundle: "HlmTooltipImports" },
  { used: /(?<![\w-])hlmBadge(?![\w-])/, directive: "HlmBadge", bundle: "HlmBadgeImports" },
];

for (const file of files.filter((candidate) => candidate.name.endsWith(".ts") && /@Component\(/.test(candidate.text))) {
  const url = /templateUrl:\s*["']([^"']+)["']/.exec(file.text);
  const templatePath = url ? path.join(root, path.dirname(file.name), url[1]) : undefined;
  const template = templatePath
    ? fs.existsSync(templatePath)
      ? fs.readFileSync(templatePath, "utf8")
      : ""
    : (/template:\s*`([\s\S]*?)`/.exec(file.text)?.[1] ?? "");
  // Comments describe markup without being markup.
  const markup = template.replace(/<!--[\s\S]*?-->/g, "");
  const imports = /@Component\(\{[\s\S]*?\bimports:\s*\[([\s\S]*?)\]/.exec(file.text)?.[1] ?? "";
  for (const { used, directive, bundle } of HELM_ATTRIBUTES) {
    const imported = new RegExp(`(^|[\\s,.\\[])(${directive}|${bundle})\\b`).test(imports);
    if (used.test(markup) && !imported) {
      failures.push(`${file.name}: its template uses ${directive}'s attribute but the component does not import ${directive}; nothing else reports this`);
    }
  }
}

const count = (pattern) => files.reduce((total, file) => total + (file.text.match(pattern) ?? []).length, 0);
const counts = {
  standaloneFalse: count(/standalone:\s*false/g),
  materialNames: count(/\bmat[A-Z][A-Za-z]*/g),
};

if (update) {
  fs.writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + "\n");
  console.log(`trap-baseline.json: ${JSON.stringify(counts)}`);
} else {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  for (const [name, value] of Object.entries(counts)) {
    if (value > baseline[name]) {
      failures.push(`${name}: ${value}, above the ${baseline[name]} in tools/trap-baseline.json. This count only goes down.`);
    } else if (value < baseline[name]) {
      failures.push(`${name}: ${value}, below the ${baseline[name]} in tools/trap-baseline.json. Good: run "node tools/check-traps.cjs --update" and commit the file.`);
    }
  }
}

const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
if (packageVersion !== "0.0.0") {
  failures.push(`package.json: version is ${packageVersion}. The one version is the release tag; keep 0.0.0 here.`);
}

const swaggerPath = path.join(root, "..", "api", "swagger.yml");
if (fs.existsSync(swaggerPath)) {
  const swaggerVersion = /^ {2}version:\s*(\S+)/m.exec(fs.readFileSync(swaggerPath, "utf8"))?.[1];
  if (swaggerVersion !== "0.0.0") {
    failures.push(`api/swagger.yml: info.version is ${swaggerVersion}. The one version is the release tag; keep 0.0.0 here.`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  console.error(`\ncheck:traps failed (${failures.length}).`);
  process.exit(1);
}

console.log(`check:traps passed (${counts.standaloneFalse} standalone: false, ${counts.materialNames} Material-era names).`);
