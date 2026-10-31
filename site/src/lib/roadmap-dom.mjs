// The browser side of the roadmap: loads the data (roadmap.mjs) and draws the cards. Everything that comes from GitHub
// is written with textContent or setAttribute, never innerHTML, and links carry rel="noopener noreferrer".
import { loadRoadmap } from "./roadmap.mjs";

const SVG = "http://www.w3.org/2000/svg";
const THUMB = [
  "M7 10v12",
  "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",
];

const KEYS = [
  ["planned", "planned"],
  ["inProgress", "in-progress"],
  ["shipped", "shipped"],
];

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function thumbIcon(doc) {
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "size-3.5");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of THUMB) {
    const path = doc.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

export function renderCard(doc, card) {
  const li = el(doc, "li", "flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card p-4");
  li.dataset.testid = "roadmap-card";
  li.append(el(doc, "h4", "break-words text-[15px] font-semibold leading-snug", card.title));
  if (card.summary) li.append(el(doc, "p", "line-clamp-2 break-words text-[13px] text-muted-foreground", card.summary));
  if (card.chips.length) {
    const chips = el(doc, "ul", "flex flex-wrap gap-1.5");
    for (const chip of card.chips.slice(0, 4)) {
      chips.append(el(doc, "li", "rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground", chip));
    }
    li.append(chips);
  }
  const pill = el(
    doc,
    "a",
    "inline-flex h-8 items-center gap-1.5 self-start rounded-md border border-border/70 bg-muted/30 px-2.5 text-xs font-medium transition-colors duration-150 hover:bg-accent",
  );
  pill.href = card.url;
  pill.target = "_blank";
  pill.rel = "noopener noreferrer";
  pill.dataset.testid = "roadmap-upvote";
  pill.setAttribute("aria-label", card.votes === null ? `${card.title}: add your thumbs-up on GitHub` : `${card.title}: ${card.votes} thumbs-up, add yours on GitHub`);
  pill.append(thumbIcon(doc), el(doc, "span", "tabular-nums", card.votes === null ? "–" : String(card.votes)));
  li.append(pill);
  return li;
}

/** Fills the three columns inside `root` (each `[data-testid="roadmap-column-<key>"]` has a `[data-list]` and a `[data-count]`). */
export function renderColumns(doc, root, columns, limit = Infinity) {
  for (const [key, slug] of KEYS) {
    const column = root.querySelector(`[data-testid="roadmap-column-${slug}"]`);
    const list = column.querySelector("[data-list]");
    const cards = columns[key];
    list.replaceChildren();
    if (cards.length === 0) {
      const empty = el(doc, "li", "rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[13px] text-muted-foreground", "Nothing here right now.");
      list.append(empty);
    } else {
      for (const card of cards.slice(0, limit)) list.append(renderCard(doc, card));
    }
    column.querySelector("[data-count]").textContent = String(cards.length);
  }
}

/** Loads and draws every `[data-roadmap]` block of the page. */
export async function startRoadmap(win) {
  const roots = [...win.document.querySelectorAll("[data-roadmap]")];
  if (roots.length === 0) return;
  let storage;
  try {
    storage = win.sessionStorage;
  } catch {
    storage = undefined;
  }
  const { source, columns } = await loadRoadmap({ fetch: win.fetch.bind(win), storage });
  for (const root of roots) {
    renderColumns(win.document, root, columns, Number(root.dataset.limit) || Infinity);
    root.dataset.source = source;
    root.setAttribute("aria-busy", "false");
  }
}
