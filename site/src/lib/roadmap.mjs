// Roadmap data: the public issues of the project repository, mapped to three columns. Plain functions with no DOM, so
// tests/unit can run them under Node. The browser side (fetching, caching, drawing) is roadmap-dom.mjs.

export const REPO_URL = "https://github.com/wouekk/cartvibe";
export const ISSUES_API = "https://api.github.com/repos/wouekk/cartvibe/issues?labels=roadmap&state=all&per_page=30";
export const REQUEST_URL = `${REPO_URL}/issues/new?labels=enhancement,roadmap`;
export const BOARD_URL = `${REPO_URL}/issues?q=is%3Aissue+label%3Aroadmap`;
export const CACHE_KEY = "cartvibe-roadmap-v1";
export const CACHE_MS = 15 * 60 * 1000;

/**
 * A card as the page draws it. `votes` is null when the number is not known (the curated list).
 * @typedef {{ title: string, summary: string, chips: string[], votes: number | null, url: string }} Card
 */
/** @typedef {{ planned: Card[], inProgress: Card[], shipped: Card[] }} Columns */

// What the page shows when GitHub cannot be reached, is rate limited or has nothing under the label. It is a curated
// list of real intentions and of things that are in the app, not a claim about dates.
/** @type {Columns} */
export const FALLBACK_ROADMAP = {
  planned: [
    { title: "Recurring bill reminders", summary: "Rent, internet and insurance come back every month. CartVibe would remind you before they are due and file the receipt for you.", chips: ["Bills", "Reminders"], votes: null, url: BOARD_URL },
    { title: "Price history across stores", summary: "See what a product cost last month and in the other shop, from the product lines you already scanned.", chips: ["Insights", "Groceries"], votes: null, url: BOARD_URL },
    { title: "Barcode quick-add on shopping lists", summary: "Scan a barcode in the aisle and the product lands on the list, name and category filled in.", chips: ["Shopping lists", "Barcode"], votes: null, url: BOARD_URL },
    { title: "Receipt export bundles", summary: "Export a month or a year of receipts with their photos as one file, for the accountant or for your own archive.", chips: ["Export"], votes: null, url: BOARD_URL },
  ],
  inProgress: [
    { title: "iPhone app", summary: "A native CartVibe for iPhone: scan a receipt or tick off the list in the shop, even without signal. Your data stays on the phone or in your own iCloud.", chips: ["iPhone"], votes: null, url: `${REPO_URL}/issues/1` },
  ],
  shipped: [
    { title: "Charts on a free licence", summary: "The Dashboard donut and bars are drawn with Chart.js: same colours in every palette, a lighter page.", chips: ["Dashboard"], votes: null, url: `${REPO_URL}/blob/main/CHANGELOG.md` },
    { title: "Shop logos", summary: "Optional logos next to each shop in receipts and lists, with your own free Logo.dev key.", chips: ["Receipts"], votes: null, url: `${REPO_URL}/blob/main/CHANGELOG.md` },
    { title: "Colour palettes in day and night", summary: "Zinc plus Blue, Indigo, Emerald and Violet, each in a light and a dark version.", chips: ["Appearance"], votes: null, url: `${REPO_URL}/blob/main/CHANGELOG.md` },
  ],
};

/** Markdown to one line of plain text. Order matters: code and HTML go first, so their contents are not read as markup. */
export function stripMarkdown(markdown) {
  if (typeof markdown !== "string") return "";
  return markdown
    .replace(/\r/g, "")
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>+\s?/gm, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, "")
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const labelName = (l) => (typeof l === "string" ? l : l && typeof l.name === "string" ? l.name : "");
const isProjectUrl = (u) => typeof u === "string" && u.startsWith(`${REPO_URL}/`);

/**
 * Reduces the API answer to what the page needs and drops pull requests. Returns [] for anything that is not a list.
 * This is also what is cached, so a cache entry never holds more than the page can draw.
 */
export function normalise(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i) => i && typeof i === "object" && !("pull_request" in i) && typeof i.title === "string")
    .map((i) => ({
      title: i.title.trim(),
      body: stripMarkdown(i.body).slice(0, 320),
      state: i.state === "closed" ? "closed" : "open",
      notPlanned: i.state_reason === "not_planned",
      labels: Array.isArray(i.labels) ? i.labels.map(labelName).filter(Boolean) : [],
      votes: Number.isFinite(i.reactions?.["+1"]) ? i.reactions["+1"] : 0,
      url: isProjectUrl(i.html_url) ? i.html_url : BOARD_URL,
      closedAt: typeof i.closed_at === "string" ? i.closed_at : "",
      createdAt: typeof i.created_at === "string" ? i.created_at : "",
    }));
}

const hidden = (name) => name === "roadmap" || name.startsWith("status:");

/**
 * Sorts the issues into the three columns. Closed with `roadmap` or `status:shipped` is shipped (unless it was closed as
 * "not planned"), open with `status:in-progress` is in progress, every other open `roadmap` issue is planned.
 * Planned and in progress go by thumbs-up, shipped by the day it was closed.
 * @returns {Columns}
 */
export function mapIssues(issues) {
  const card = (i) => ({ title: i.title, summary: i.body, chips: i.labels.filter((l) => !hidden(l)), votes: i.votes, url: i.url });
  const byVotes = (a, b) => b.votes - a.votes || b.createdAt.localeCompare(a.createdAt);
  const rows = { planned: [], inProgress: [], shipped: [] };
  for (const i of issues) {
    const roadmap = i.labels.includes("roadmap");
    if (i.state === "closed") {
      if (!i.notPlanned && (roadmap || i.labels.includes("status:shipped"))) rows.shipped.push(i);
    } else if (i.labels.includes("status:in-progress")) rows.inProgress.push(i);
    else if (roadmap) rows.planned.push(i);
  }
  return {
    planned: rows.planned.sort(byVotes).map(card),
    inProgress: rows.inProgress.sort(byVotes).map(card),
    shipped: rows.shipped.sort((a, b) => b.closedAt.localeCompare(a.closedAt)).map(card),
  };
}

export const isEmpty = (c) => c.planned.length + c.inProgress.length + c.shipped.length === 0;

/** The cached issues, or null when there is none, it is older than 15 minutes, or the store is unreadable. */
export function readCache(storage, now) {
  try {
    const entry = JSON.parse(storage.getItem(CACHE_KEY));
    if (!entry || typeof entry.at !== "number" || !Array.isArray(entry.issues)) return null;
    if (now - entry.at < 0 || now - entry.at >= CACHE_MS) return null;
    return entry.issues;
  } catch {
    return null;
  }
}

export function writeCache(storage, now, issues) {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify({ at: now, issues }));
  } catch {
    // Private mode or a full store: the page works without a cache.
  }
}

/**
 * The columns to draw and where they came from: "cache", "live" or "fallback". Never throws: a network error, a rate
 * limit (403), a bad answer or an empty board all end in the curated list.
 * @param {{ fetch: typeof fetch, storage: Storage | undefined, now?: () => number }} env
 */
export async function loadRoadmap(env) {
  const now = (env.now ?? Date.now)();
  const cached = env.storage ? readCache(env.storage, now) : null;
  if (cached) {
    const columns = mapIssues(cached);
    if (!isEmpty(columns)) return { source: "cache", columns };
  }
  try {
    const res = await env.fetch(ISSUES_API, {
      headers: { Accept: "application/vnd.github+json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const issues = normalise(await res.json());
    const columns = mapIssues(issues);
    if (isEmpty(columns)) throw new Error("empty");
    if (env.storage) writeCache(env.storage, now, issues);
    return { source: "live", columns };
  } catch {
    return { source: "fallback", columns: FALLBACK_ROADMAP };
  }
}
