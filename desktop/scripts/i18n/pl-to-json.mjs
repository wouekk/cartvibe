// One-off: turns the three Polish TypeScript message files into src/assets/i18n/pl.json.
// Last one wins in spread order PL_CORE < PL_MORE < PL_FEEDBACK. Asserts the key count (939) before and after.
// Kept in the repo for the record; the TypeScript message files are deleted once pl.json exists.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = join(root, "src", "i18n", "languages");
// The plan said 908; the line scan and the evaluated objects agree on 939 distinct keys (several month names share a line).
const EXPECTED = 939;

function load(file, name) {
  const source = readFileSync(join(dir, file), "utf8");
  const js = source.replace(/export const \w+: Record<string, string> =/, "result =");
  const sandbox = { result: undefined };
  vm.runInNewContext(js, sandbox);
  const lineKeys = [...source.matchAll(/(?:^|,)\s*("(?:[^"\\]|\\.)*")\s*:\s*"/gm)].map((m) => JSON.parse(m[1]));
  return { name, entries: sandbox.result, lineKeys };
}

const sources = [
  load("pl.messages.ts", "PL_CORE"),
  load("pl.messages-more.ts", "PL_MORE"),
  load("pl.messages-feedback.ts", "PL_FEEDBACK"),
];

const messages = {};
const seen = new Map();
const duplicates = [];
for (const { name, entries, lineKeys } of sources) {
  const inFile = new Set();
  for (const key of lineKeys) {
    if (inFile.has(key)) duplicates.push(`${key} (twice in ${name})`);
    inFile.add(key);
  }
  if (inFile.size !== Object.keys(entries).length) throw new Error(`line scan ${inFile.size} vs eval ${Object.keys(entries).length} for ${name}`);
  for (const [key, value] of Object.entries(entries)) {
    if (seen.has(key) && seen.get(key) !== name) duplicates.push(`${key} (${seen.get(key)} overridden by ${name})`);
    seen.set(key, name);
    messages[key] = value;
  }
}

const distinct = new Set(sources.flatMap((s) => s.lineKeys)).size;
if (distinct !== EXPECTED) throw new Error(`expected ${EXPECTED} distinct keys before conversion, found ${distinct}`);

// Old pluralIndex: 0 = one, 1 = 2-4, 2 = 5+. "other" is the form fractions take.
const plurals = {
  item: { one: "produkt", few: "produkty", many: "produktów", other: "produktu" },
  list: { one: "lista", few: "listy", many: "list", other: "listy" },
  receipt: { one: "paragon", few: "paragony", many: "paragonów", other: "paragonu" },
  day: { one: "dzień", few: "dni", many: "dni", other: "dnia" },
  month: { one: "miesiąc", few: "miesiące", many: "miesięcy", other: "miesiąca" },
};

const sorted = Object.fromEntries(
  Object.keys(messages)
    .sort()
    .map((k) => [k, messages[k]])
);
if (Object.keys(sorted).length !== EXPECTED) throw new Error(`expected ${EXPECTED} keys after conversion`);
writeFileSync(join(root, "src", "assets", "i18n", "pl.json"), JSON.stringify({ messages: sorted, plurals }, null, 2) + "\n");
console.log(`pl.json written: ${Object.keys(sorted).length} keys; ${duplicates.length} duplicate(s):`);
for (const d of duplicates) console.log("  " + d);
