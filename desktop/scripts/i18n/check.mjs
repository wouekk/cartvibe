// npm run i18n:check -> fails when the catalogue is stale or a language file is inconsistent; warns (and prints coverage) about gaps.
import { existsSync, readdirSync } from "node:fs";
import {
  API_LOCALES,
  CATALOGUE,
  apiLocalePath,
  apiLocalesOf,
  catalogueOf,
  closestKey,
  extract,
  languageFilePath,
  pluralCategories,
  placeholders,
  readJson,
  readRegistry,
  readText,
} from "./lib.mjs";

const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);

// Problems found while reading the code (6: template literals or concatenations passed to t( or a snackbar).
const extraction = extract();
for (const problem of extraction.problems) fail(problem);

// 1. en.json is what a fresh extract gives.
const fresh = catalogueOf(extraction);
const committed = existsSync(CATALOGUE) ? readJson(CATALOGUE) : undefined;
if (!committed) {
  fail("en.json is missing: run npm run i18n:extract");
} else if (JSON.stringify(committed) !== JSON.stringify(fresh)) {
  const have = new Set(Object.keys(committed.messages));
  const want = new Set(Object.keys(fresh.messages));
  const added = [...want].filter((key) => !have.has(key));
  const removed = [...have].filter((key) => !want.has(key));
  fail(`en.json is out of date (${added.length} new, ${removed.length} gone): run npm run i18n:extract and commit it`);
  for (const key of added.slice(0, 10)) console.error(`    new: ${key}`);
  for (const key of removed.slice(0, 10)) console.error(`    gone: ${key}`);
}

const keys = Object.keys(fresh.messages);
const keySet = new Set(keys);
const nouns = Object.keys(fresh.plurals);

const coverage = [];
for (const language of readRegistry()) {
  if (language.code === "en") continue;

  // 5. languages.json lists a code that has a file.
  const path = languageFilePath(language.code);
  if (!existsSync(path)) {
    fail(`languages.json lists "${language.code}" but ${language.code}.json does not exist: run npm run i18n:sync -- --lang ${language.code}`);
    continue;
  }
  const file = JSON.parse(readText(path));
  const messages = file.messages ?? {};
  const plurals = file.plurals ?? {};

  for (const [key, value] of Object.entries(messages)) {
    // 2. no key that is not in the catalogue (English copy changed and left its translation orphaned).
    if (!keySet.has(key)) {
      const hint = closestKey(key, keys);
      fail(`${language.code}.json has a key that is not in the catalogue: "${key}"${hint ? `\n      closest current key: "${hint}"` : ""}`);
      continue;
    }
    // 3. same {placeholders} as the English key.
    if (typeof value === "string" && value !== "" && placeholders(value) !== placeholders(key)) {
      fail(`${language.code}.json: placeholders differ for "${key}": "${value}"`);
    }
  }

  // 4. plural categories are exactly the language's CLDR categories.
  const categories = pluralCategories(language.locale);
  for (const [noun, forms] of Object.entries(plurals)) {
    if (!nouns.includes(noun)) {
      fail(`${language.code}.json has a plural noun that is not in the catalogue: "${noun}"`);
    } else if (Object.keys(forms).sort().join() !== categories.join()) {
      fail(`${language.code}.json: plural "${noun}" has categories [${Object.keys(forms).sort()}] but ${language.locale} uses [${categories}]`);
    }
  }

  const missing = keys.filter((key) => typeof messages[key] !== "string" || messages[key] === "");
  const missingNouns = nouns.filter((noun) => !plurals[noun] || categories.some((category) => !plurals[noun][category]));
  const total = keys.length + nouns.length;
  const done = total - missing.length - missingNouns.length;
  coverage.push({ code: language.code, partial: language.partial === true, done, total, missing, missingNouns });
}

for (const { code, partial, done, total, missing, missingNouns } of coverage) {
  const percent = total ? ((done / total) * 100).toFixed(1) : "100.0";
  console.log(`${code}: ${done}/${total} translated (${percent}%)`);
  if (missing.length || missingNouns.length) {
    // A language ships complete unless languages.json marks it "partial": true (then the gaps only warn and show English).
    (partial ? warnings : failures).push(`${code}: ${missing.length + missingNouns.length} missing translations${partial ? " (shown in English)" : "; translate them or mark the language partial in languages.json"}`);
    for (const key of missing.slice(0, 15)) console.log(`    missing: ${key}`);
    for (const noun of missingNouns.slice(0, 5)) console.log(`    missing plural: ${noun}`);
    if (missing.length > 15) console.log(`    ... and ${missing.length - 15} more`);
  }
}
// 7. The API's locale files are what a fresh extract gives (a stale one leaves a report in English, or in old wording).
const apiLocales = apiLocalesOf(extraction);
for (const [code, file] of apiLocales) {
  const path = apiLocalePath(code);
  if (!existsSync(path) || JSON.stringify(readJson(path)) !== JSON.stringify(file)) {
    fail(`api/internal/i18n/locales/${code}.json is out of date: run npm run i18n:extract and commit it`);
  }
}
for (const name of existsSync(API_LOCALES) ? readdirSync(API_LOCALES) : []) {
  if (name.endsWith(".json") && !apiLocales.has(name.slice(0, -5))) {
    fail(`api/internal/i18n/locales/${name} belongs to no language in languages.json: delete it`);
  }
}

for (const warning of warnings) console.warn(`warning: ${warning}`);

if (failures.length) {
  console.error("\ni18n:check failed:");
  for (const message of failures) console.error("  - " + message);
  process.exit(1);
}
console.log("i18n:check passed.");
