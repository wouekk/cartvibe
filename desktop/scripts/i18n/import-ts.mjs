// npm run i18n:import -- <legacy.ts> [--lang pl]
// For a branch cut before the JSON dictionaries: merges its legacy `export const X: Record<string, string> = {...}` file
// into <lang>.json. Run it after merging the branch with main and `npm run i18n:extract`. Keys the catalogue does not
// have (copy that changed, or code that was not merged) are listed and skipped; existing translations are kept.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { CATALOGUE, languageFilePath, readJson } from "./lib.mjs";

const args = process.argv.slice(2);
const langIndex = args.indexOf("--lang");
const lang = langIndex >= 0 ? args[langIndex + 1] : "pl";
const source = args.find((arg, index) => !arg.startsWith("--") && (langIndex < 0 || index !== langIndex + 1));
if (!source) {
  console.error("usage: npm run i18n:import -- <legacy.ts> [--lang pl]");
  process.exit(2);
}

const sandbox = { result: undefined };
vm.runInNewContext(readFileSync(source, "utf8").replace(/export const \w+(?::\s*[^=]+)?\s*=/, "result ="), sandbox);

const file = languageFilePath(lang);
const target = readJson(file);
const known = new Set(Object.keys(readJson(CATALOGUE).messages));
const added = [];
const skipped = [];
for (const [english, translated] of Object.entries(sandbox.result ?? {})) {
  if (!known.has(english)) skipped.push(english);
  else if (typeof target.messages[english] !== "string" || target.messages[english] === "") {
    target.messages[english] = translated;
    added.push(english);
  }
}

target.messages = Object.fromEntries(Object.entries(target.messages).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
writeFileSync(file, JSON.stringify(target, null, 2) + "\n");
console.log(`${lang}.json: ${added.length} added, ${skipped.length} skipped (not in en.json).`);
for (const key of skipped) console.log(`    skipped: ${key}`);
