// Shared by extract.mjs, check.mjs and sync.mjs. Node built-ins only (no npm dependencies).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const API = join(DESKTOP, "..", "api", "internal");
export const I18N_DIR = join(DESKTOP, "src", "assets", "i18n");
export const CATALOGUE = join(I18N_DIR, "en.json");
export const REGISTRY = join(I18N_DIR, "languages.json");

/** Keys that cannot be found by reading the code: month names (used by `months()` on period labels). */
export const EXTRA_KEYS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SKIP_DIRS = new Set(["node_modules", "open-api", "assets", "dist", "e2e", "scripts"]);

function walk(dir, accept, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(path, accept, out);
    } else if (accept(name)) {
      out.push(path);
    }
  }
  return out;
}

export const readText = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
export const readJson = (path) => JSON.parse(readText(path));
export const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
export const rel = (path) => relative(DESKTOP, path).replace(/\\/g, "/");

export function placeholders(text) {
  return (String(text).match(/\{\w+\}/g) ?? []).sort().join();
}

export function sortObject(object) {
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]));
}

/** The language entries from languages.json. */
export function readRegistry() {
  return readJson(REGISTRY);
}

export function readLanguageFile(code) {
  const path = join(I18N_DIR, `${code}.json`);
  return existsSync(path) ? readJson(path) : undefined;
}

export function languageFilePath(code) {
  return join(I18N_DIR, `${code}.json`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Literals

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
export const decodeEntities = (text) => text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (entity) => ENTITIES[entity]);

/** The text of a quoted JavaScript literal (quote included), with escapes resolved. */
function unquote(literal) {
  const quote = literal[0];
  const body = literal.slice(1, -1);
  return body.replace(/\\(.)/gs, (_, char) => {
    if (char === "n") return "\n";
    if (char === "t") return "\t";
    if (char === "u" || char === "x") return "\\" + char;
    return char;
  }).replace(new RegExp(`\\\\${quote}`, "g"), quote);
}

const LITERAL = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;

/** The string literals a pipe's input is made of, going backwards from `index`: 'a', or cond ? 'a' : 'b', or (…). */
function literalsBefore(text, index) {
  const found = [];
  let i = index - 1;
  for (;;) {
    while (i >= 0 && /[\s)]/.test(text[i])) i--;
    const quote = text[i];
    if (quote !== "'" && quote !== '"') break;
    let start = i - 1;
    while (start >= 0 && !(text[start] === quote && text[start - 1] !== "\\")) start--;
    if (start < 0) break;
    found.push(unquote(text.slice(start, i + 1)));
    i = start - 1;
    while (i >= 0 && /\s/.test(text[i])) i--;
    if (text[i] === ":" || text[i] === "?") {
      i--;
    } else {
      break;
    }
  }
  return found;
}

/** The literals of an Angular expression that is only a literal or a conditional of literals; else nothing. */
function literalsOfExpression(expression) {
  const text = expression.trim();
  if (!text || text.includes("|") || text.includes("`") || /\+/.test(text.replace(new RegExp(LITERAL, "g"), ""))) return [];
  const found = [];
  const regex = new RegExp(LITERAL, "g");
  let match;
  while ((match = regex.exec(text))) {
    const before = text.slice(0, match.index).trimEnd();
    const after = text.slice(match.index + match[0].length).trimStart();
    const startsHere = before === "" || before.endsWith("?") || before.endsWith(":") || before.endsWith("(");
    const endsHere = after === "" || after.startsWith(":") || after.startsWith(")");
    if (startsHere && endsHere) found.push(unquote(match[0]));
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------
// Front end

/** Inputs of shared components that translate their text internally, and the tags they are read on. */
const TEXT_INPUTS = {
  common: ["label", "headerText", "buttonText", "subtitle", "hint", "placeholder", "tooltip", "ariaLabel", "dialogContent"],
  "app-settings-page": ["title", "description"],
  "app-settings-section": ["title", "description"],
  "app-badge": ["text"],
};

const TAG = /<([a-zA-Z][\w-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTRIBUTE = /([\[(*#]?[\w.:-]+[\])]?)(?:\s*=\s*("[^"]*"|'[^']*'))?/g;

function templateMessages(text, add, addPlural) {
  const pipe = /(?<!\|)\|\s*t(?![\w-])/g;
  let match;
  while ((match = pipe.exec(text))) {
    for (const literal of literalsBefore(text, match.index)) add(literal, match.index);
  }

  const plural = new RegExp(String.raw`\|\s*plural\s*:\s*(${LITERAL})\s*:\s*(${LITERAL})`, "g");
  while ((match = plural.exec(text))) {
    addPlural(unquote(match[1]), unquote(match[2]), match.index);
  }

  while ((match = TAG.exec(text))) {
    const [, tag, attributes] = match;
    const allowed = new Set([...(tag.startsWith("app-") ? TEXT_INPUTS.common : []), ...(TEXT_INPUTS[tag] ?? [])]);
    if (!allowed.size) continue;
    let attribute;
    ATTRIBUTE.lastIndex = 0;
    while ((attribute = ATTRIBUTE.exec(attributes))) {
      const [, name, rawValue] = attribute;
      if (rawValue === undefined) continue;
      const value = rawValue.slice(1, -1);
      const at = match.index;
      if (allowed.has(name) && !value.includes("{{") && value.trim()) {
        add(decodeEntities(value), at);
      } else if (name.startsWith("[") && allowed.has(name.slice(1, -1))) {
        for (const literal of literalsOfExpression(decodeEntities(value))) add(literal, at);
      }
    }
  }
  TAG.lastIndex = 0;
}

const SNACKBAR = /[sS]nackbar\w*\s*\.\s*(?:success|error|info)\s*\(\s*/g;
const TRANSLATE_CALL = /(?<![\w$])t\s*\(\s*/g;
const MARKER_CALL = /(?<![\w$])marker\s*\(\s*/g;

/** Where a call's first argument is a plain string literal, a template literal with values, or a concatenation. */
function callArguments(text, regex, handle) {
  let match;
  while ((match = regex.exec(text))) {
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const literal = new RegExp(`^(${LITERAL})`).exec(rest);
    if (literal) {
      const after = rest.slice(literal[1].length).trimStart();
      handle(after.startsWith("+") ? "concatenation" : "literal", unquote(literal[1]), match.index);
      continue;
    }
    const template = /^`((?:[^`\\]|\\.)*)`/s.exec(rest);
    if (template) {
      handle(template[1].includes("${") ? "template" : "literal", template[1], match.index);
    }
  }
}

function scriptMessages(text, add, problem) {
  const handle = (what) => (kind, value, at) => {
    if (kind === "literal") add(value, at);
    else problem(`${what} gets ${kind === "template" ? "a template literal with values" : "a concatenation"}: use a key with {placeholders} and parameters`, at);
  };
  callArguments(text, TRANSLATE_CALL, handle("t()"));
  callArguments(text, SNACKBAR, handle("snackbar"));
  callArguments(text, MARKER_CALL, handle("marker()"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Go

const GO_STRING = String.raw`"(?:[^"\\\n]|\\.)*"`;

function goMessages(text, add) {
  const calls = new RegExp(String.raw`WriteCustomErrorResponse\(\s*[^,()]+,\s*(${GO_STRING})`, "g");
  const maps = new RegExp(String.raw`errors\["\w+"\]\s*=\s*(${GO_STRING})`, "g");
  for (const regex of [calls, maps]) {
    let match;
    while ((match = regex.exec(text))) {
      try {
        add(JSON.parse(match[1]), match.index);
      } catch {
        // a Go escape JSON does not know: not a message a person reads
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------

/**
 * Reads the code and returns what the interface can show: `messages` (a Set of English keys), `plurals`
 * (singular -> plural), where each key was found, and the problems that fail `i18n:check`.
 */
export function extract() {
  const messages = new Map();
  const plurals = new Map();
  const problems = [];
  const lineOf = (text, index) => text.slice(0, index).split("\n").length;

  const files = walk(join(DESKTOP, "src"), (name) => /\.(html|ts)$/.test(name) && !/\.(spec|d)\.ts$/.test(name) && name !== "marker.ts");
  for (const file of files) {
    const text = readText(file);
    const where = (index) => `${rel(file)}:${lineOf(text, index)}`;
    const add = (key, index) => {
      if (key.trim() && !messages.has(key)) messages.set(key, where(index));
    };
    const addPlural = (singular, plural, index) => {
      if (plurals.has(singular) && plurals.get(singular).plural !== plural) {
        problems.push(`${where(index)}: plural of "${singular}" is "${plural}" here but "${plurals.get(singular).plural}" at ${plurals.get(singular).where}`);
      } else {
        plurals.set(singular, { plural, where: where(index) });
      }
    };
    const problem = (message, index) => problems.push(`${where(index)}: ${message}`);

    if (file.endsWith(".html") || text.includes("template:") || /\|\s*(t|plural)\b/.test(text)) {
      templateMessages(text, add, addPlural);
    }
    if (file.endsWith(".ts")) {
      scriptMessages(text, add, problem);
    }
  }

  const goFiles = existsSync(API) ? walk(API, (name) => name.endsWith(".go") && !name.endsWith("_test.go")) : [];
  for (const file of goFiles) {
    const text = readText(file);
    goMessages(text, (key, index) => {
      if (key.trim() && !messages.has(key)) messages.set(key, `${relative(join(DESKTOP, ".."), file).replace(/\\/g, "/")}:${lineOf(text, index)}`);
    });
  }

  for (const key of EXTRA_KEYS) {
    if (!messages.has(key)) messages.set(key, "scripts/i18n/lib.mjs (EXTRA_KEYS)");
  }

  return { messages, plurals, problems };
}

/** The en.json content for an extraction. */
export function catalogueOf({ messages, plurals }) {
  const sortedMessages = {};
  for (const key of [...messages.keys()].sort()) sortedMessages[key] = key;
  const sortedPlurals = {};
  for (const singular of [...plurals.keys()].sort()) {
    sortedPlurals[singular] = { one: singular, other: plurals.get(singular).plural };
  }
  return { messages: sortedMessages, plurals: sortedPlurals };
}

// ---------------------------------------------------------------------------------------------------------------------

/** The key of `keys` most like `key` (shared words), for "did the English text change?" hints. */
export function closestKey(key, keys) {
  const words = (text) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const wanted = words(key);
  let best;
  let bestScore = 0;
  for (const candidate of keys) {
    const other = words(candidate);
    let shared = 0;
    for (const word of wanted) if (other.has(word)) shared++;
    const score = shared / Math.max(wanted.size, other.size, 1);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore >= 0.4 ? best : undefined;
}

/** The CLDR plural categories of a locale, sorted. */
export function pluralCategories(locale) {
  return new Intl.PluralRules(locale).resolvedOptions().pluralCategories.slice().sort();
}
