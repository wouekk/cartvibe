// npm run i18n:sync -- --lang de [--translate]
// Creates or updates src/assets/i18n/<lang>.json from en.json: missing keys become null (they show English), existing
// translations are kept exactly, orphans move to "_orphaned" with the closest new key as a hint, keys are sorted.
// --translate (developer machine only, never CI) fills only the null keys through Gemini; GEMINI_API_KEY comes from the
// environment. It sends English interface strings only, never household data, and lists what it wrote in "_review".
import { existsSync } from "node:fs";
import { CATALOGUE, closestKey, languageFilePath, placeholders, pluralCategories, readJson, readRegistry, sortObject, writeJson } from "./lib.mjs";

const args = process.argv.slice(2);
const langIndex = args.indexOf("--lang");
const code = langIndex >= 0 ? args[langIndex + 1]?.toLowerCase() : undefined;
if (!code || !/^[a-z]{2,3}(-[a-z0-9]+)*$/.test(code) || code === "en") {
  console.error("Usage: npm run i18n:sync -- --lang <code> [--translate]   (en is the catalogue and is not synced)");
  process.exit(1);
}

const registry = readRegistry();
const entry = registry.find((language) => language.code === code);
if (!entry) {
  console.error(`"${code}" is not in src/assets/i18n/languages.json. Add a line { "code": "${code}", "label": "...", "locale": "..." } first.`);
  process.exit(1);
}

const catalogue = readJson(CATALOGUE);
const path = languageFilePath(code);
const existing = existsSync(path) ? readJson(path) : { messages: {}, plurals: {} };
const categories = pluralCategories(entry.locale);
const keys = Object.keys(catalogue.messages);
const keySet = new Set(keys);

const messages = {};
for (const key of keys) messages[key] = existing.messages?.[key] ?? null;

const orphaned = { ...(existing._orphaned ?? {}) };
let moved = 0;
for (const [key, value] of Object.entries(existing.messages ?? {})) {
  if (!keySet.has(key)) {
    orphaned[key] = { value, closest: closestKey(key, keys) };
    moved++;
  }
}

const plurals = {};
for (const noun of Object.keys(catalogue.plurals)) {
  plurals[noun] = Object.fromEntries(categories.map((category) => [category, existing.plurals?.[noun]?.[category] ?? null]));
}

const result = { messages, plurals };
if (Object.keys(orphaned).length) result._orphaned = sortObject(orphaned);
if (existing._review?.length) result._review = existing._review;

if (args.includes("--translate")) {
  await translate(result, entry);
}

writeJson(path, result);
const missing = Object.values(messages).filter((value) => value === null || value === "").length;
console.log(`${code}.json written: ${keys.length} messages (${missing} missing, shown in English), ${moved} moved to _orphaned.`);

async function translate(file, language) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("--translate needs GEMINI_API_KEY in the environment.");
    process.exit(1);
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const todo = Object.keys(file.messages).filter((key) => file.messages[key] === null || file.messages[key] === "");
  const review = new Set(file._review ?? []);
  console.log(`Translating ${todo.length} keys into ${language.label} with ${model} (English interface strings only)...`);

  for (let i = 0; i < todo.length; i += 40) {
    const batch = todo.slice(i, i + 40);
    const prompt =
      `Translate these user interface strings of a household grocery budget app from English into ${language.label} (locale ${language.locale}). ` +
      `Keep every {placeholder} exactly as written, keep the tone short and plain. Answer with a JSON object mapping each English string to its translation.\n` +
      JSON.stringify(batch);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    if (!response.ok) throw new Error(`Gemini answered ${response.status}`);
    const answer = JSON.parse((await response.json()).candidates[0].content.parts[0].text);
    for (const key of batch) {
      const value = answer[key];
      // Only an answer that keeps the placeholders is accepted; anything else stays missing (English).
      if (typeof value === "string" && value.trim() && placeholders(value) === placeholders(key)) {
        file.messages[key] = value;
        review.add(key);
      }
    }
  }
  file._review = [...review].sort();
}
