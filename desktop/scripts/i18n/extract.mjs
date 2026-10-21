// npm run i18n:extract  -> rebuilds src/assets/i18n/en.json (the catalogue) from the code. Add --list to print where each key is.
import { CATALOGUE, catalogueOf, extract, writeJson } from "./lib.mjs";

const result = extract();
if (result.problems.length) {
  console.error("Problems found while reading the code:");
  for (const problem of result.problems) console.error("  " + problem);
  process.exitCode = 1;
}

const catalogue = catalogueOf(result);
writeJson(CATALOGUE, catalogue);
console.log(`en.json written: ${Object.keys(catalogue.messages).length} messages, ${Object.keys(catalogue.plurals).length} plural nouns.`);

if (process.argv.includes("--list")) {
  for (const [key, where] of result.messages) console.log(`${where}\t${key}`);
}
