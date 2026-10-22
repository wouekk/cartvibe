// npm run i18n:extract  -> rebuilds src/assets/i18n/en.json (the catalogue) from the code, and the API's locale files
// (api/internal/i18n/locales/<code>.json: each language's translations of the texts the API translates itself, such
// as the words of a generated report). Add --list to print where each key is.
import { mkdirSync } from "node:fs";
import { API_LOCALES, CATALOGUE, apiLocalePath, apiLocalesOf, catalogueOf, extract, writeJson } from "./lib.mjs";

const result = extract();
if (result.problems.length) {
  console.error("Problems found while reading the code:");
  for (const problem of result.problems) console.error("  " + problem);
  process.exitCode = 1;
}

const catalogue = catalogueOf(result);
writeJson(CATALOGUE, catalogue);
console.log(`en.json written: ${Object.keys(catalogue.messages).length} messages, ${Object.keys(catalogue.plurals).length} plural nouns.`);

mkdirSync(API_LOCALES, { recursive: true });
for (const [code, file] of apiLocalesOf(result)) {
  writeJson(apiLocalePath(code), file);
  console.log(`api/internal/i18n/locales/${code}.json written: ${Object.keys(file.messages).length} of ${result.apiKeys.size} API texts.`);
}

if (process.argv.includes("--list")) {
  for (const [key, where] of result.messages) console.log(`${where}\t${key}`);
}
